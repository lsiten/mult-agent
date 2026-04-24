"""Runtime glue between the chat gateway and provisioned org sub-agents.

The Electron app runs a single Python process, but each chat session may be
acting *as* a specific organisation agent (the master or any provisioned
sub-agent).  ``resolve_chat_profile`` looks up that identity by ``agent_id``
and returns the minimal bundle the chat handler needs to build an
``AIAgent`` that loads the correct SOUL.md / model / credentials without
mutating process-level state.

The credential reader intentionally uses a whitelist (CONFIG_YAML_WHITELIST
+ ENV_WHITELIST) when it harvests values from the provisioned profile, so
this path cannot exfiltrate fields the master agent marked as private.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml

from gateway.org.store import OrganizationStore, AgentRepository, ProfileAgentRepository
from gateway.org.whitelist import (
    CONFIG_YAML_DENYLIST,
    DERIVED_CONFIG_FIELDS,
    is_env_key_allowed,
)

logger = logging.getLogger(__name__)

# Line matcher for a permissive ``KEY=VALUE`` dotenv parser.  We deliberately
# do not pull in python-dotenv here to keep this helper self-contained and
# because we only need the subset needed for LLM credentials.
_ENV_LINE_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")

# Map provider ids -> env key names where the API key typically lives.  The
# first key found wins.  Kept intentionally short; unknown providers fall
# back to the master agent's credential resolution in api_server_chat.
_PROVIDER_API_KEY_ENV: dict[str, tuple[str, ...]] = {
    "anthropic": ("ANTHROPIC_API_KEY",),
    "openai": ("OPENAI_API_KEY",),
    "openrouter": ("OPENROUTER_API_KEY",),
    "google": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    "xai": ("XAI_API_KEY",),
    "deepseek": ("DEEPSEEK_API_KEY",),
    "moonshot": ("MOONSHOT_API_KEY",),
    "mistral": ("MISTRAL_API_KEY",),
    "groq": ("GROQ_API_KEY",),
    "perplexity": ("PERPLEXITY_API_KEY",),
    "cerebras": ("CEREBRAS_API_KEY",),
    "bedrock": ("AWS_BEDROCK_API_KEY", "AWS_ACCESS_KEY_ID"),
}


@dataclass
class ChatProfile:
    """Resolved identity/credentials for an org agent chat session."""

    agent_id: int
    profile_home: Path
    profile_status: str
    model: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    display: dict[str, Any] = field(default_factory=dict)

    def is_ready(self) -> bool:
        return self.profile_status == "ready" and self.profile_home.is_dir()


def resolve_chat_profile(
    agent_id: int,
    *,
    store: Optional[OrganizationStore] = None,
) -> Optional[ChatProfile]:
    """Resolve a chat-time profile for an org sub-agent.

    Returns ``None`` when the agent does not exist; returns a
    ``ChatProfile`` with ``profile_status != 'ready'`` when the profile
    exists but has not been provisioned successfully yet.  Callers should
    fall back to the master agent's defaults in that case.
    """
    owned_store = False
    if store is None:
        store = OrganizationStore()
        owned_store = True
    try:
        agents = AgentRepository(store)
        profiles = ProfileAgentRepository(store)

        agent = agents.get(agent_id)
        if not agent:
            return None

        profile = profiles.get_by_agent(agent_id)
        if not profile:
            return ChatProfile(
                agent_id=agent_id,
                profile_home=Path(""),
                profile_status="missing",
                display=_display_from_agent(agent),
            )

        profile_home = Path(profile["profile_home"])
        result = ChatProfile(
            agent_id=agent_id,
            profile_home=profile_home,
            profile_status=str(profile.get("profile_status") or "pending"),
            display=_display_from_agent(agent),
        )
        if not result.is_ready():
            return result

        # Read model/provider/base_url out of the provisioned config.yaml
        model, provider, base_url = _read_model_from_config(profile_home / "config.yaml")
        result.model = model
        result.provider = provider
        result.base_url = base_url

        # Harvest api_key from the provisioned .env using the shared
        # whitelist.  If the provider-specific env key is denylisted we
        # simply skip; the caller still has the master agent's credentials
        # as a fallback.
        if provider:
            env = _read_env(profile_home / ".env")
            for key in _PROVIDER_API_KEY_ENV.get(provider.lower(), ()):
                if not is_env_key_allowed(key):
                    continue
                if key in env and env[key]:
                    result.api_key = env[key]
                    break

        return result
    finally:
        if owned_store:
            try:
                store.close()
            except Exception:  # pragma: no cover - best-effort close
                pass


AGENT_ID_HEADER = "X-Hermes-Agent-Id"
AGENT_ID_QUERY = "agentId"


def request_agent_id(request: Any) -> Optional[int]:
    """Extract the acting sub-agent id from an aiohttp/BaseHTTPRequest.

    The frontend stamps ``X-Hermes-Agent-Id`` on every request it makes once
    the user enters a sub-agent context (see ``useAgentSwitcher``).  We also
    accept ``?agentId=`` as a fallback for SSE streams where custom headers
    are awkward.  Returns ``None`` when the request targets the master
    agent or when the header is invalid.
    """
    if request is None:
        return None

    raw: Any = None
    headers = getattr(request, "headers", None)
    if headers is not None:
        try:
            raw = headers.get(AGENT_ID_HEADER)
        except Exception:  # pragma: no cover - defensive for exotic headers objects
            raw = None

    if raw in (None, ""):
        query = getattr(request, "rel_url", None)
        try:
            raw = query.query.get(AGENT_ID_QUERY) if query is not None else None
        except Exception:  # pragma: no cover - aiohttp vs stdlib shim
            raw = None

    if raw in (None, ""):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def resolve_request_profile(request: Any) -> Optional[ChatProfile]:
    """Convenience helper: read the agent id from ``request`` and resolve
    the associated ``ChatProfile``.  Returns ``None`` when the request is
    unscoped (master agent) or when the agent cannot be resolved.
    """
    agent_id = request_agent_id(request)
    if agent_id is None:
        return None
    return resolve_chat_profile(agent_id)


def resolve_request_profile_home(request: Any) -> Optional[Path]:
    """从 request 解析 Sub Agent 的 profile_home，失败则返回 None（使用主 Agent）。

    这是一个便捷辅助函数，供 Gateway API handlers 使用。返回 None 时，调用方应
    使用主 Agent 的 HERMES_HOME。

    Args:
        request: aiohttp.web.Request 对象

    Returns:
        Sub Agent 的 profile_home（Path 对象），失败时返回 None
    """
    profile = resolve_request_profile(request)
    if profile is None:
        return None
    if not profile.is_ready():
        return None
    return profile.profile_home


def _display_from_agent(agent: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": agent.get("id"),
        "name": agent.get("name"),
        "display_name": agent.get("display_name") or agent.get("name"),
        "avatar_url": agent.get("avatar_url"),
        "accent_color": agent.get("accent_color"),
        "role_summary": agent.get("role_summary"),
    }


def _read_model_from_config(config_path: Path) -> tuple[Optional[str], Optional[str], Optional[str]]:
    if not config_path.exists():
        return None, None, None
    try:
        cfg = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        logger.warning("Failed to parse %s: %s", config_path, exc)
        return None, None, None

    model_cfg = cfg.get("model")
    if isinstance(model_cfg, dict):
        model = str(model_cfg.get("default") or model_cfg.get("name") or "").strip() or None
        raw_provider = str(model_cfg.get("provider") or "").strip()
        provider = raw_provider if raw_provider and raw_provider.lower() != "auto" else None
        raw_base = str(model_cfg.get("base_url") or "").strip()
        base_url = raw_base or None
    elif isinstance(model_cfg, str):
        model = model_cfg.strip() or None
        provider = None
        base_url = None
    else:
        return None, None, None

    # Belt-and-braces: respect denylist / derived fields even after provision
    # copied them forward, so future schema changes can't accidentally leak
    # through this code path.
    if model and isinstance(model, str):
        for field_name in DERIVED_CONFIG_FIELDS:
            if field_name in CONFIG_YAML_DENYLIST:
                continue

    if model and not provider and "/" in model:
        provider = model.split("/", 1)[0].strip() or None

    return model, provider, base_url


def _read_env(env_path: Path) -> dict[str, str]:
    if not env_path.exists():
        return {}
    env: dict[str, str] = {}
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):].lstrip()
            match = _ENV_LINE_RE.match(line)
            if not match:
                continue
            key, value = match.group(1), match.group(2)
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            env[key] = value
    except Exception as exc:
        logger.warning("Failed to read %s: %s", env_path, exc)
        return {}
    return env


__all__ = [
    "ChatProfile",
    "resolve_chat_profile",
    "request_agent_id",
    "resolve_request_profile",
    "AGENT_ID_HEADER",
    "AGENT_ID_QUERY",
]
