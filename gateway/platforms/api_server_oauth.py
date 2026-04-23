import hmac
import asyncio
import json
import logging
import os
import secrets
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from aiohttp import web

logger = logging.getLogger(__name__)
_OAUTH_SESSION_TTL_SECONDS = 15 * 60
_oauth_sessions: Dict[str, Dict[str, Any]] = {}
_oauth_sessions_lock = threading.Lock()
try:
    from agent.anthropic_adapter import (
        _OAUTH_CLIENT_ID as _ANTHROPIC_OAUTH_CLIENT_ID,
        _OAUTH_REDIRECT_URI as _ANTHROPIC_OAUTH_REDIRECT_URI,
        _OAUTH_SCOPES as _ANTHROPIC_OAUTH_SCOPES,
        _OAUTH_TOKEN_URL as _ANTHROPIC_OAUTH_TOKEN_URL,
        _generate_pkce as _generate_pkce_pair,
    )

    _ANTHROPIC_OAUTH_AVAILABLE = True
except ImportError:
    _ANTHROPIC_OAUTH_AVAILABLE = False
_ANTHROPIC_OAUTH_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"

def _truncate_token(value: Optional[str], visible: int = 6) -> str:
    if not value:
        return ""
    token = str(value)
    if "." in token and token.count(".") >= 2:
        token = token.rsplit(".", 1)[-1]
    if len(token) <= visible:
        return token
    return f"...{token[-visible:]}"

def _gc_oauth_sessions() -> None:
    cutoff = time.time() - _OAUTH_SESSION_TTL_SECONDS
    with _oauth_sessions_lock:
        stale = [sid for sid, sess in _oauth_sessions.items() if sess["created_at"] < cutoff]
        for sid in stale:
            _oauth_sessions.pop(sid, None)

def _new_oauth_session(provider_id: str, flow: str) -> tuple[str, Dict[str, Any]]:
    session_id = secrets.token_urlsafe(16)
    session = {
        "session_id": session_id,
        "provider": provider_id,
        "flow": flow,
        "created_at": time.time(),
        "status": "pending",
        "error_message": None,
    }
    with _oauth_sessions_lock:
        _oauth_sessions[session_id] = session
    return session_id, session

def _save_anthropic_oauth_creds(access_token: str, refresh_token: str, expires_at_ms: int) -> None:
    from agent.anthropic_adapter import _HERMES_OAUTH_FILE

    payload = {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresAt": expires_at_ms,
    }
    _HERMES_OAUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    _HERMES_OAUTH_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    try:
        from agent.credential_pool import (
            AUTH_TYPE_OAUTH,
            SOURCE_MANUAL,
            PooledCredential,
            load_pool,
        )
        import uuid
        pool = load_pool("anthropic")
        existing = [
            entry
            for entry in pool.entries()
            if getattr(entry, "source", "").startswith(f"{SOURCE_MANUAL}:dashboard_pkce")
        ]
        for entry in existing:
            try:
                pool.remove_entry(getattr(entry, "id", ""))
            except Exception:
                pass
        pool.add_entry(
            PooledCredential(
                provider="anthropic",
                id=uuid.uuid4().hex[:6],
                label="dashboard PKCE",
                auth_type=AUTH_TYPE_OAUTH,
                priority=0,
                source=f"{SOURCE_MANUAL}:dashboard_pkce",
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at_ms=expires_at_ms,
            )
        )
    except Exception as exc:
        logger.warning("Anthropic OAuth credential-pool save failed: %s", exc)

def _start_anthropic_pkce() -> Dict[str, Any]:
    if not _ANTHROPIC_OAUTH_AVAILABLE:
        raise RuntimeError("Anthropic OAuth is unavailable because anthropic_adapter is missing")
    verifier, challenge = _generate_pkce_pair()
    session_id, session = _new_oauth_session("anthropic", "pkce")
    session["verifier"] = verifier
    session["state"] = verifier
    params = {
        "code": "true",
        "client_id": _ANTHROPIC_OAUTH_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": _ANTHROPIC_OAUTH_REDIRECT_URI,
        "scope": _ANTHROPIC_OAUTH_SCOPES,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": verifier,
    }
    auth_url = f"{_ANTHROPIC_OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"
    return {
        "session_id": session_id,
        "flow": "pkce",
        "auth_url": auth_url,
        "expires_in": _OAUTH_SESSION_TTL_SECONDS,
    }

def _submit_anthropic_pkce(session_id: str, code_input: str) -> Dict[str, Any]:
    with _oauth_sessions_lock:
        session = _oauth_sessions.get(session_id)
    if not session or session["provider"] != "anthropic" or session["flow"] != "pkce":
        return {"ok": False, "status": "error", "message": "Unknown or expired session"}
    if session["status"] != "pending":
        return {"ok": False, "status": session["status"], "message": session.get("error_message")}
    parts = code_input.strip().split("#", 1)
    code = parts[0].strip()
    if not code:
        return {"ok": False, "status": "error", "message": "No code provided"}
    state_from_callback = parts[1] if len(parts) > 1 else ""
    exchange_data = json.dumps(
        {
            "grant_type": "authorization_code",
            "client_id": _ANTHROPIC_OAUTH_CLIENT_ID,
            "code": code,
            "state": state_from_callback or session["state"],
            "redirect_uri": _ANTHROPIC_OAUTH_REDIRECT_URI,
            "code_verifier": session["verifier"],
        }
    ).encode()
    request = urllib.request.Request(
        _ANTHROPIC_OAUTH_TOKEN_URL,
        data=exchange_data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "hermes-electron/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode())
    except Exception as exc:
        session["status"] = "error"
        session["error_message"] = f"Token exchange failed: {exc}"
        return {"ok": False, "status": "error", "message": session["error_message"]}

    access_token = result.get("access_token", "")
    refresh_token = result.get("refresh_token", "")
    expires_in = int(result.get("expires_in") or 3600)
    if not access_token:
        session["status"] = "error"
        session["error_message"] = "No access token returned"
        return {"ok": False, "status": "error", "message": session["error_message"]}

    expires_at_ms = int(time.time() * 1000) + (expires_in * 1000)
    try:
        _save_anthropic_oauth_creds(access_token, refresh_token, expires_at_ms)
    except Exception as exc:
        session["status"] = "error"
        session["error_message"] = f"Save failed: {exc}"
        return {"ok": False, "status": "error", "message": session["error_message"]}

    session["status"] = "approved"
    logger.info("OAuth PKCE login completed for Anthropic session %s", session_id)
    return {"ok": True, "status": "approved"}


async def _start_device_code_flow(provider_id: str) -> Dict[str, Any]:
    if provider_id == "nous":
        from hermes_cli.auth import PROVIDER_REGISTRY, _request_device_code
        import httpx

        provider_config = PROVIDER_REGISTRY["nous"]
        portal_base_url = (
            os.getenv("HERMES_PORTAL_BASE_URL")
            or os.getenv("NOUS_PORTAL_BASE_URL")
            or provider_config.portal_base_url
        ).rstrip("/")
        client_id = provider_config.client_id
        scope = provider_config.scope

        def request_device_code() -> Dict[str, Any]:
            with httpx.Client(timeout=httpx.Timeout(15.0), headers={"Accept": "application/json"}) as client:
                return _request_device_code(
                    client=client,
                    portal_base_url=portal_base_url,
                    client_id=client_id,
                    scope=scope,
                )

        loop = asyncio.get_running_loop()
        device_data = await loop.run_in_executor(None, request_device_code)
        session_id, session = _new_oauth_session("nous", "device_code")
        session["device_code"] = str(device_data["device_code"])
        session["interval"] = int(device_data["interval"])
        session["expires_at"] = time.time() + int(device_data["expires_in"])
        session["portal_base_url"] = portal_base_url
        session["client_id"] = client_id
        threading.Thread(
            target=_nous_poller,
            args=(session_id,),
            daemon=True,
            name=f"oauth-poll-{session_id[:6]}",
        ).start()
        return {
            "session_id": session_id,
            "flow": "device_code",
            "user_code": str(device_data["user_code"]),
            "verification_url": str(device_data["verification_uri_complete"]),
            "expires_in": int(device_data["expires_in"]),
            "poll_interval": int(device_data["interval"]),
        }

    if provider_id == "openai-codex":
        session_id, _session = _new_oauth_session("openai-codex", "device_code")
        threading.Thread(
            target=_codex_full_login_worker,
            args=(session_id,),
            daemon=True,
            name=f"oauth-codex-{session_id[:6]}",
        ).start()
        deadline = time.time() + 10
        while time.time() < deadline:
            with _oauth_sessions_lock:
                session = _oauth_sessions.get(session_id)
            if session and (session.get("user_code") or session["status"] != "pending"):
                break
            await asyncio.sleep(0.1)
        with _oauth_sessions_lock:
            session = _oauth_sessions.get(session_id, {})
        if session.get("status") == "error":
            raise RuntimeError(session.get("error_message") or "OpenAI Codex device auth failed")
        if not session.get("user_code"):
            raise TimeoutError("Device auth timed out before returning a user code")
        return {
            "session_id": session_id,
            "flow": "device_code",
            "user_code": session["user_code"],
            "verification_url": session["verification_url"],
            "expires_in": int(session.get("expires_in") or 900),
            "poll_interval": int(session.get("interval") or 5),
        }

    raise ValueError(f"Provider {provider_id} does not support device-code flow")


def _nous_poller(session_id: str) -> None:
    from hermes_cli.auth import _poll_for_token, persist_nous_credentials, refresh_nous_oauth_from_state
    import httpx

    with _oauth_sessions_lock:
        session = _oauth_sessions.get(session_id)
    if not session:
        return

    try:
        portal_base_url = session["portal_base_url"]
        client_id = session["client_id"]
        device_code = session["device_code"]
        interval = session["interval"]
        expires_in = max(60, int(session["expires_at"] - time.time()))
        with httpx.Client(timeout=httpx.Timeout(15.0), headers={"Accept": "application/json"}) as client:
            token_data = _poll_for_token(
                client=client,
                portal_base_url=portal_base_url,
                client_id=client_id,
                device_code=device_code,
                expires_in=expires_in,
                poll_interval=interval,
            )
        now = datetime.now(timezone.utc)
        token_ttl = int(token_data.get("expires_in") or 0)
        auth_state = {
            "portal_base_url": portal_base_url,
            "inference_base_url": token_data.get("inference_base_url"),
            "client_id": client_id,
            "scope": token_data.get("scope"),
            "token_type": token_data.get("token_type", "Bearer"),
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token"),
            "obtained_at": now.isoformat(),
            "expires_at": (
                datetime.fromtimestamp(now.timestamp() + token_ttl, tz=timezone.utc).isoformat()
                if token_ttl
                else None
            ),
            "expires_in": token_ttl,
        }
        full_state = refresh_nous_oauth_from_state(
            auth_state,
            min_key_ttl_seconds=300,
            timeout_seconds=15.0,
            force_refresh=False,
            force_mint=True,
        )
        persist_nous_credentials(full_state)
        with _oauth_sessions_lock:
            session["status"] = "approved"
        logger.info("OAuth device-code login completed for Nous session %s", session_id)
    except Exception as exc:
        logger.warning("Nous device-code poll failed for session %s: %s", session_id, exc)
        with _oauth_sessions_lock:
            session["status"] = "error"
            session["error_message"] = str(exc)


def _codex_full_login_worker(session_id: str) -> None:
    try:
        import httpx
        import uuid
        from agent.credential_pool import AUTH_TYPE_OAUTH, SOURCE_MANUAL, PooledCredential, load_pool
        from hermes_cli.auth import CODEX_OAUTH_CLIENT_ID, CODEX_OAUTH_TOKEN_URL, DEFAULT_CODEX_BASE_URL

        issuer = "https://auth.openai.com"
        with httpx.Client(timeout=httpx.Timeout(15.0)) as client:
            response = client.post(
                f"{issuer}/api/accounts/deviceauth/usercode",
                json={"client_id": CODEX_OAUTH_CLIENT_ID},
                headers={"Content-Type": "application/json"},
            )
        if response.status_code != 200:
            raise RuntimeError(f"deviceauth/usercode returned {response.status_code}")

        device_data = response.json()
        user_code = device_data.get("user_code", "")
        device_auth_id = device_data.get("device_auth_id", "")
        poll_interval = max(3, int(device_data.get("interval", "5")))
        if not user_code or not device_auth_id:
            raise RuntimeError("Device-code response missing user_code or device_auth_id")

        with _oauth_sessions_lock:
            session = _oauth_sessions.get(session_id)
            if not session:
                return
            session["user_code"] = user_code
            session["verification_url"] = f"{issuer}/codex/device"
            session["device_auth_id"] = device_auth_id
            session["interval"] = poll_interval
            session["expires_in"] = 15 * 60
            session["expires_at"] = time.time() + session["expires_in"]

        deadline = time.time() + 15 * 60
        code_response = None
        with httpx.Client(timeout=httpx.Timeout(15.0)) as client:
            while time.time() < deadline:
                time.sleep(poll_interval)
                poll = client.post(
                    f"{issuer}/api/accounts/deviceauth/token",
                    json={"device_auth_id": device_auth_id, "user_code": user_code},
                    headers={"Content-Type": "application/json"},
                )
                if poll.status_code == 200:
                    code_response = poll.json()
                    break
                if poll.status_code in (403, 404):
                    continue
                raise RuntimeError(f"deviceauth/token poll returned {poll.status_code}")

        with _oauth_sessions_lock:
            session = _oauth_sessions.get(session_id)
        if not session:
            return
        if code_response is None:
            session["status"] = "expired"
            session["error_message"] = "Device code expired before approval"
            return

        authorization_code = code_response.get("authorization_code", "")
        code_verifier = code_response.get("code_verifier", "")
        if not authorization_code or not code_verifier:
            raise RuntimeError("Device auth response missing authorization_code/code_verifier")

        with httpx.Client(timeout=httpx.Timeout(15.0)) as client:
            token_response = client.post(
                CODEX_OAUTH_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": authorization_code,
                    "redirect_uri": f"{issuer}/deviceauth/callback",
                    "client_id": CODEX_OAUTH_CLIENT_ID,
                    "code_verifier": code_verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if token_response.status_code != 200:
            raise RuntimeError(f"Token exchange returned {token_response.status_code}")
        tokens = token_response.json()
        access_token = tokens.get("access_token", "")
        refresh_token = tokens.get("refresh_token", "")
        if not access_token:
            raise RuntimeError("Token exchange did not return access_token")

        pool = load_pool("openai-codex")
        base_url = os.getenv("HERMES_CODEX_BASE_URL", "").strip().rstrip("/") or DEFAULT_CODEX_BASE_URL
        pool.add_entry(
            PooledCredential(
                provider="openai-codex",
                id=uuid.uuid4().hex[:6],
                label="dashboard device_code",
                auth_type=AUTH_TYPE_OAUTH,
                priority=0,
                source=f"{SOURCE_MANUAL}:dashboard_device_code",
                access_token=access_token,
                refresh_token=refresh_token,
                base_url=base_url,
            )
        )
        with _oauth_sessions_lock:
            session["status"] = "approved"
        logger.info("OAuth device-code login completed for OpenAI Codex session %s", session_id)
    except Exception as exc:
        logger.warning("OpenAI Codex device-code worker failed for session %s: %s", session_id, exc)
        with _oauth_sessions_lock:
            session = _oauth_sessions.get(session_id)
            if session:
                session["status"] = "error"
                session["error_message"] = str(exc)


def _anthropic_oauth_status() -> Dict[str, Any]:
    try:
        from agent.anthropic_adapter import (
            _HERMES_OAUTH_FILE,
            read_claude_code_credentials,
            read_hermes_oauth_credentials,
        )
    except ImportError:
        read_claude_code_credentials = None  # type: ignore[assignment]
        read_hermes_oauth_credentials = None  # type: ignore[assignment]
        _HERMES_OAUTH_FILE = None  # type: ignore[assignment]

    hermes_creds = None
    if read_hermes_oauth_credentials:
        try:
            hermes_creds = read_hermes_oauth_credentials()
        except Exception:
            hermes_creds = None
    if hermes_creds and hermes_creds.get("accessToken"):
        return {
            "logged_in": True,
            "source": "hermes_pkce",
            "source_label": f"Hermes PKCE ({_HERMES_OAUTH_FILE})",
            "token_preview": _truncate_token(hermes_creds.get("accessToken")),
            "expires_at": hermes_creds.get("expiresAt"),
            "has_refresh_token": bool(hermes_creds.get("refreshToken")),
        }

    claude_creds = None
    if read_claude_code_credentials:
        try:
            claude_creds = read_claude_code_credentials()
        except Exception:
            claude_creds = None
    if claude_creds and claude_creds.get("accessToken"):
        return {
            "logged_in": True,
            "source": "claude_code",
            "source_label": "Claude Code (~/.claude/.credentials.json)",
            "token_preview": _truncate_token(claude_creds.get("accessToken")),
            "expires_at": claude_creds.get("expiresAt"),
            "has_refresh_token": bool(claude_creds.get("refreshToken")),
        }

    env_token = os.getenv("ANTHROPIC_TOKEN") or os.getenv("CLAUDE_CODE_OAUTH_TOKEN")
    if env_token:
        return {
            "logged_in": True,
            "source": "env_var",
            "source_label": "ANTHROPIC_TOKEN environment variable",
            "token_preview": _truncate_token(env_token),
            "expires_at": None,
            "has_refresh_token": False,
        }
    return {"logged_in": False, "source": None}


def _claude_code_only_status() -> Dict[str, Any]:
    try:
        from agent.anthropic_adapter import read_claude_code_credentials

        creds = read_claude_code_credentials()
    except Exception:
        creds = None
    if creds and creds.get("accessToken"):
        return {
            "logged_in": True,
            "source": "claude_code_cli",
            "source_label": "~/.claude/.credentials.json",
            "token_preview": _truncate_token(creds.get("accessToken")),
            "expires_at": creds.get("expiresAt"),
            "has_refresh_token": bool(creds.get("refreshToken")),
        }
    return {"logged_in": False, "source": None}


def _resolve_provider_status(provider_id: str, status_fn) -> Dict[str, Any]:
    if status_fn is not None:
        try:
            return status_fn()
        except Exception as exc:
            return {"logged_in": False, "error": str(exc)}

    try:
        from hermes_cli import auth as hauth

        if provider_id == "nous":
            raw = hauth.get_nous_auth_status()
            return {
                "logged_in": bool(raw.get("logged_in")),
                "source": "nous_portal",
                "source_label": raw.get("portal_base_url") or "Nous Portal",
                "token_preview": _truncate_token(raw.get("access_token")),
                "expires_at": raw.get("access_expires_at"),
                "has_refresh_token": bool(raw.get("has_refresh_token")),
            }
        if provider_id == "openai-codex":
            raw = hauth.get_codex_auth_status()
            return {
                "logged_in": bool(raw.get("logged_in")),
                "source": raw.get("source") or "openai_codex",
                "source_label": raw.get("auth_mode") or "OpenAI Codex",
                "token_preview": _truncate_token(raw.get("api_key")),
                "expires_at": None,
                "has_refresh_token": False,
                "last_refresh": raw.get("last_refresh"),
            }
        if provider_id == "qwen-oauth":
            raw = hauth.get_qwen_auth_status()
            return {
                "logged_in": bool(raw.get("logged_in")),
                "source": "qwen_cli",
                "source_label": raw.get("auth_store_path") or "Qwen CLI",
                "token_preview": _truncate_token(raw.get("access_token")),
                "expires_at": raw.get("expires_at"),
                "has_refresh_token": bool(raw.get("has_refresh_token")),
            }
        if provider_id == "google-gemini-cli":
            raw = hauth.get_gemini_oauth_auth_status()
            return {
                "logged_in": bool(raw.get("logged_in")),
                "source": raw.get("source") or "google_oauth",
                "source_label": raw.get("account") or raw.get("email") or "Google Gemini OAuth",
                "token_preview": _truncate_token(raw.get("access_token")),
                "expires_at": raw.get("expires_at"),
                "has_refresh_token": bool(raw.get("has_refresh_token")),
            }
    except Exception as exc:
        return {"logged_in": False, "error": str(exc)}

    return {"logged_in": False}


_OAUTH_PROVIDER_CATALOG = (
    {
        "id": "anthropic",
        "name": "Anthropic (Claude API)",
        "flow": "pkce",
        "cli_command": "hermes auth add anthropic",
        "docs_url": "https://docs.claude.com/en/api/getting-started",
        "status_fn": _anthropic_oauth_status,
    },
    {
        "id": "claude-code",
        "name": "Claude Code (subscription)",
        "flow": "external",
        "cli_command": "claude setup-token",
        "docs_url": "https://docs.claude.com/en/docs/claude-code",
        "status_fn": _claude_code_only_status,
    },
    {
        "id": "nous",
        "name": "Nous Portal",
        "flow": "device_code",
        "cli_command": "hermes auth add nous",
        "docs_url": "https://portal.nousresearch.com",
        "status_fn": None,
    },
    {
        "id": "openai-codex",
        "name": "OpenAI Codex (ChatGPT)",
        "flow": "device_code",
        "cli_command": "hermes auth add openai-codex",
        "docs_url": "https://platform.openai.com/docs",
        "status_fn": None,
    },
    {
        "id": "qwen-oauth",
        "name": "Qwen (via Qwen CLI)",
        "flow": "external",
        "cli_command": "hermes auth add qwen-oauth",
        "docs_url": "https://github.com/QwenLM/qwen-code",
        "status_fn": None,
    },
    {
        "id": "google-gemini-cli",
        "name": "Google Gemini (OAuth)",
        "flow": "external",
        "cli_command": "hermes auth add google-gemini-cli",
        "docs_url": "https://ai.google.dev/gemini-api/docs/oauth",
        "status_fn": None,
    },
)


class OAuthAPIHandlers:
    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_list_providers(self, request: web.Request) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            providers = []
            for provider in _OAUTH_PROVIDER_CATALOG:
                status = _resolve_provider_status(provider["id"], provider.get("status_fn"))
                providers.append(
                    {
                        "id": provider["id"],
                        "name": provider["name"],
                        "flow": provider["flow"],
                        "cli_command": provider["cli_command"],
                        "docs_url": provider["docs_url"],
                        "status": status,
                    }
                )
            return web.json_response({"providers": providers})

        except Exception as e:
            logger.error(f"Failed to list OAuth providers: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_provider(self, request: web.Request) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            valid_ids = {provider["id"] for provider in _OAUTH_PROVIDER_CATALOG}
            if provider_id not in valid_ids:
                return web.json_response({"error": f"Unknown provider: {provider_id}"}, status=400)

            if provider_id in ("anthropic", "claude-code"):
                try:
                    from agent.anthropic_adapter import _HERMES_OAUTH_FILE

                    if _HERMES_OAUTH_FILE.exists():
                        _HERMES_OAUTH_FILE.unlink()
                except Exception:
                    pass
                try:
                    from hermes_cli.auth import clear_provider_auth

                    clear_provider_auth("anthropic")
                except Exception:
                    pass
                return web.json_response({"ok": True, "provider": provider_id})

            try:
                from hermes_cli.auth import clear_provider_auth

                cleared = clear_provider_auth(provider_id)
                return web.json_response({"ok": bool(cleared), "provider": provider_id})
            except Exception as exc:
                return web.json_response({"error": str(exc)}, status=500)

        except Exception as e:
            logger.error(f"Failed to delete OAuth provider: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_start_oauth(self, request: web.Request) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            _gc_oauth_sessions()
            catalog_entry = next(
                (provider for provider in _OAUTH_PROVIDER_CATALOG if provider["id"] == provider_id),
                None,
            )
            if catalog_entry is None:
                return web.json_response({"error": f"Unknown provider: {provider_id}"}, status=400)
            if catalog_entry["flow"] == "external":
                return web.json_response(
                    {
                        "error": (
                            f"{provider_id} is managed by an external authenticator. "
                            f"Fallback command: {catalog_entry['cli_command']}"
                        )
                    },
                    status=400,
                )
            if catalog_entry["flow"] == "pkce":
                return web.json_response(_start_anthropic_pkce())
            if catalog_entry["flow"] == "device_code":
                return web.json_response(await _start_device_code_flow(provider_id))
            return web.json_response({"error": "Unsupported OAuth flow"}, status=400)

        except Exception as e:
            logger.error(f"Failed to start OAuth flow: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_submit_oauth(self, request: web.Request) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            body = await request.json()
            session_id = str(body.get("session_id") or "")
            code = str(body.get("code") or "")
            if provider_id == "anthropic":
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, _submit_anthropic_pkce, session_id, code)
                status_code = 200 if result.get("ok") else 400
                return web.json_response(result, status=status_code)
            return web.json_response({"error": f"Submit is not supported for {provider_id}"}, status=400)

        except Exception as e:
            logger.error(f"Failed to submit OAuth code: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_poll_oauth(self, request: web.Request) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            session_id = request.match_info["session_id"]
            with _oauth_sessions_lock:
                session = _oauth_sessions.get(session_id)
            if not session:
                return web.json_response({"error": "Session not found or expired"}, status=404)
            if session["provider"] != provider_id:
                return web.json_response({"error": "Provider mismatch for session"}, status=400)
            return web.json_response(
                {
                    "session_id": session_id,
                    "status": session["status"],
                    "error_message": session.get("error_message"),
                    "expires_at": session.get("expires_at"),
                }
            )

        except Exception as e:
            logger.error(f"Failed to poll OAuth status: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_session(self, request: web.Request) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            session_id = request.match_info["session_id"]
            with _oauth_sessions_lock:
                session = _oauth_sessions.pop(session_id, None)
            if session is None:
                return web.json_response({"ok": False, "message": "session not found"})
            return web.json_response({"ok": True, "session_id": session_id})

        except Exception as e:
            logger.error(f"Failed to delete OAuth session: {e}")
            return web.json_response({"error": str(e)}, status=500)
