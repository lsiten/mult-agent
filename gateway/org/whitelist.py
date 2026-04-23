"""Inheritance whitelists and denylists for sub-agent bootstrap.

These policies decide what the master agent is allowed to pass down to
sub-agents when provisioning their profile. They live in code (not in the
database) to make tampering obvious in code review.

See: docs/企业组织架构页面编排说明.md section 14.8.1.
"""

from __future__ import annotations

import re
from typing import Iterable

# ---------------------------------------------------------------------------
# config.yaml whitelist (fields allowed to flow master → sub-agent config)
# ---------------------------------------------------------------------------

# Dotted paths; "*" matches one path segment (not recursive by itself, but
# leaf wildcard after a prefix means "the entire subtree below that prefix").
CONFIG_YAML_WHITELIST: tuple[str, ...] = (
    # model defaults
    "model.default",
    "model.provider",
    "model.base_url",
    # provider / smart routing subtrees
    "provider_routing.*",
    "smart_model_routing.*",
    # terminal runtime (cwd is re-derived per sub-agent, see DERIVED_FIELDS)
    "terminal.backend",
    "terminal.timeout",
    "terminal.lifetime_seconds",
    "terminal.container_cpu",
    "terminal.container_memory",
    "terminal.container_disk",
    "terminal.container_persistent",
    "terminal.docker_image",
    "terminal.singularity_image",
    "terminal.modal_image",
    "terminal.daytona_image",
    # security posture is safe to mirror
    "security.tirith_enabled",
    "security.tirith_path",
)

# Fields that must never be copied, even if present under a whitelisted prefix.
# These are user/session-bound or main-agent-only state.
CONFIG_YAML_DENYLIST: tuple[str, ...] = (
    "terminal.cwd",
    "terminal.ssh_key",
    "terminal.ssh_key_path",
    "auth.*",
    "oauth.*",
    "session.*",
)


# ---------------------------------------------------------------------------
# .env whitelist (variables allowed to flow master → sub-agent .env)
# ---------------------------------------------------------------------------

# Explicit whitelist: Provider API keys + Provider base URLs + terminal runtime.
# Listed verbatim from the design doc for auditability.
ENV_WHITELIST: frozenset[str] = frozenset(
    {
        # Provider API keys
        "OPENROUTER_API_KEY",
        "ARK_API_KEY",
        "ARK_BASE_URL",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "GEMINI_BASE_URL",
        "OLLAMA_API_KEY",
        "OLLAMA_BASE_URL",
        "GLM_API_KEY",
        "GLM_BASE_URL",
        "KIMI_API_KEY",
        "KIMI_BASE_URL",
        "KIMI_CN_API_KEY",
        "ARCEEAI_API_KEY",
        "ARCEE_BASE_URL",
        "MINIMAX_API_KEY",
        "MINIMAX_BASE_URL",
        "MINIMAX_CN_API_KEY",
        "MINIMAX_CN_BASE_URL",
        "OPENCODE_ZEN_API_KEY",
        "OPENCODE_ZEN_BASE_URL",
        "OPENCODE_GO_API_KEY",
        "OPENCODE_GO_BASE_URL",
        "HF_TOKEN",
        "XIAOMI_API_KEY",
        "XIAOMI_BASE_URL",
        # Public research / scraping tool keys (tools/skills that opt-in
        # are still gated by master_agent_assets.visibility = public).
        "EXA_API_KEY",
        "PARALLEL_API_KEY",
        "FIRECRAWL_API_KEY",
        "FAL_KEY",
        "BROWSERBASE_API_KEY",
        "BROWSERBASE_PROJECT_ID",
        "BROWSERBASE_PROXIES",
        # Terminal runtime defaults
        "TERMINAL_ENV",
        "HERMES_DOCKER_BINARY",
        "TERMINAL_DOCKER_IMAGE",
        "TERMINAL_SINGULARITY_IMAGE",
        "TERMINAL_MODAL_IMAGE",
        "TERMINAL_TIMEOUT",
        "TERMINAL_LIFETIME_SECONDS",
        "TERMINAL_SSH_HOST",
        "TERMINAL_SSH_USER",
        "TERMINAL_SSH_PORT",
    }
)

# Variables that are NEVER inheritable, regardless of whitelist matches.
# Ordering: most-specific literals first, then substring heuristics.
ENV_DENYLIST_LITERAL: frozenset[str] = frozenset(
    {
        "SUDO_PASSWORD",
        "TERMINAL_CWD",
        "TERMINAL_SSH_KEY",
        "TERMINAL_SSH_PASSWORD",
    }
)

# Substring heuristics applied case-insensitively when a variable is not in
# ENV_WHITELIST. These catch session-bound / account-bound credentials that
# the whitelist cannot possibly cover (custom or plugin-specific names).
_ENV_DENY_SUBSTRINGS: tuple[str, ...] = (
    "ACCESS_TOKEN",
    "REFRESH_TOKEN",
    "ID_TOKEN",
    "SESSION",
    "COOKIE",
    "WEBHOOK",
    "OAUTH",
    "SECRET",
    "PASSWORD",
    "CREDENTIAL",
    "CREDENTIALS",
    "PRIVATE_KEY",
)

_ENV_DENY_SUBSTRING_RE = re.compile(
    "|".join(re.escape(s) for s in _ENV_DENY_SUBSTRINGS),
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Provider-level env grouping
# ---------------------------------------------------------------------------
#
# ``PROVIDER_ENV_KEYS`` maps a provider id (matching ``web/src/lib/providers.ts``)
# to the subset of ``ENV_WHITELIST`` it owns. This groups per-provider env keys
# so the operator can flip visibility Public / Private **per provider** on the
# master agent's Env page, instead of toggling the entire ``.env`` as one unit.
#
# Invariants (enforced at module import time, see ``_validate_provider_map``):
#   * Every value must be a subset of ``ENV_WHITELIST`` so code review remains
#     the only way to widen what can ever leave the master agent.
#   * Provider ids must be filesystem / url safe (``[a-z][a-z0-9_-]*``) so they
#     can appear in REST paths without extra escaping.
#
# Providers not listed here (e.g. ``anthropic``, ``deepseek`` as of today) are
# intentionally omitted: their API keys are not in ``ENV_WHITELIST``, so there
# is no safe way to inherit them. Adding one requires touching both tables
# below in a single reviewed commit.
PROVIDER_ENV_KEYS: dict[str, frozenset[str]] = {
    "openrouter": frozenset({"OPENROUTER_API_KEY"}),
    "volcengine": frozenset({"ARK_API_KEY", "ARK_BASE_URL"}),
    "zai": frozenset({"GLM_API_KEY", "GLM_BASE_URL"}),
    "kimi": frozenset({"KIMI_API_KEY", "KIMI_BASE_URL", "KIMI_CN_API_KEY"}),
    "gemini": frozenset({"GOOGLE_API_KEY", "GEMINI_API_KEY", "GEMINI_BASE_URL"}),
    "minimax": frozenset(
        {
            "MINIMAX_API_KEY",
            "MINIMAX_BASE_URL",
            "MINIMAX_CN_API_KEY",
            "MINIMAX_CN_BASE_URL",
        }
    ),
    "xiaomi": frozenset({"XIAOMI_API_KEY", "XIAOMI_BASE_URL"}),
    "ollama": frozenset({"OLLAMA_API_KEY", "OLLAMA_BASE_URL"}),
    "huggingface": frozenset({"HF_TOKEN"}),
    "opencode_zen": frozenset({"OPENCODE_ZEN_API_KEY", "OPENCODE_ZEN_BASE_URL"}),
    "opencode_go": frozenset({"OPENCODE_GO_API_KEY", "OPENCODE_GO_BASE_URL"}),
    "arceeai": frozenset({"ARCEEAI_API_KEY", "ARCEE_BASE_URL"}),
}

# Non-provider runtime env keys that a master agent may optionally pass down
# (Docker / singularity / SSH defaults for the sub-agent terminal). Kept as a
# separate group so the Env page's per-provider toggle does not conflate them
# with LLM credentials.
RUNTIME_ENV_KEYS: frozenset[str] = frozenset(
    {
        "TERMINAL_ENV",
        "HERMES_DOCKER_BINARY",
        "TERMINAL_DOCKER_IMAGE",
        "TERMINAL_SINGULARITY_IMAGE",
        "TERMINAL_MODAL_IMAGE",
        "TERMINAL_TIMEOUT",
        "TERMINAL_LIFETIME_SECONDS",
        "TERMINAL_SSH_HOST",
        "TERMINAL_SSH_USER",
        "TERMINAL_SSH_PORT",
    }
)

# Tool / research keys that are in ENV_WHITELIST but not tied to a model
# provider (Exa, Firecrawl, etc.). They follow the same inheritance path as
# runtime keys — grouped so the UI can present them separately from LLM
# credentials if/when we expose a toggle for them.
TOOL_ENV_KEYS: frozenset[str] = frozenset(
    {
        "EXA_API_KEY",
        "PARALLEL_API_KEY",
        "FIRECRAWL_API_KEY",
        "FAL_KEY",
        "BROWSERBASE_API_KEY",
        "BROWSERBASE_PROJECT_ID",
        "BROWSERBASE_PROXIES",
    }
)

_PROVIDER_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


def _validate_provider_map() -> None:
    """Fail-fast validation so a typo can never widen inheritance at runtime.

    * Every value must be a subset of ``ENV_WHITELIST``.
    * Every provider id must match ``_PROVIDER_ID_RE``.
    * Provider key groups must be pairwise disjoint — a single env key cannot
      belong to two providers (otherwise toggling one would implicitly leak
      another).
    """
    seen: dict[str, str] = {}
    for provider_id, keys in PROVIDER_ENV_KEYS.items():
        if not _PROVIDER_ID_RE.fullmatch(provider_id):
            raise RuntimeError(
                f"PROVIDER_ENV_KEYS: invalid provider id {provider_id!r}"
            )
        not_whitelisted = keys - ENV_WHITELIST
        if not_whitelisted:
            raise RuntimeError(
                "PROVIDER_ENV_KEYS: keys not in ENV_WHITELIST for "
                f"{provider_id!r}: {sorted(not_whitelisted)}"
            )
        for key in keys:
            if key in seen and seen[key] != provider_id:
                raise RuntimeError(
                    f"PROVIDER_ENV_KEYS: key {key!r} mapped to both "
                    f"{seen[key]!r} and {provider_id!r}"
                )
            seen[key] = provider_id
    overlap = RUNTIME_ENV_KEYS & set(seen)
    if overlap:
        raise RuntimeError(
            "RUNTIME_ENV_KEYS overlaps with a provider: " f"{sorted(overlap)}"
        )
    tool_overlap = TOOL_ENV_KEYS & set(seen)
    if tool_overlap:
        raise RuntimeError(
            "TOOL_ENV_KEYS overlaps with a provider: " f"{sorted(tool_overlap)}"
        )


_validate_provider_map()


def provider_for_env_key(key: str) -> str | None:
    """Return the provider id that owns ``key``, if any."""
    upper = (key or "").upper()
    for provider_id, keys in PROVIDER_ENV_KEYS.items():
        if upper in keys:
            return provider_id
    return None


def is_provider_id_valid(provider_id: str) -> bool:
    """Check that ``provider_id`` is both syntactically valid and registered."""
    if not provider_id or not _PROVIDER_ID_RE.fullmatch(provider_id):
        return False
    return provider_id in PROVIDER_ENV_KEYS


def is_env_key_allowed(key: str) -> bool:
    """Decide if a single environment variable can be inherited.

    Rules (in order):
      1. Must be a syntactically valid shell identifier (safety net).
      2. Literal denylist wins over everything.
      3. Whitelist membership allows inheritance.
      4. Substring heuristics reject anything that looks like a credential
         outside the whitelist.
    """
    if not key or not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key):
        return False
    if key in ENV_DENYLIST_LITERAL:
        return False
    if key in ENV_WHITELIST:
        return True
    if _ENV_DENY_SUBSTRING_RE.search(key):
        return False
    # Unknown but non-suspicious variables default to DENY.
    # Explicit whitelisting is required for any inheritance to occur.
    return False


def filter_env(
    env: dict[str, str],
    *,
    extra_allowed: Iterable[str] | None = None,
) -> dict[str, str]:
    """Return only inheritable keys from ``env``.

    ``extra_allowed`` lets a master_agent_assets record opt-in additional
    keys needed by a public tool/skill (still subject to the literal
    denylist and substring heuristics).
    """
    allowed_extra = {k.upper() for k in (extra_allowed or ())}
    result: dict[str, str] = {}
    for key, value in env.items():
        upper = key.upper()
        if upper in ENV_DENYLIST_LITERAL:
            continue
        if upper in ENV_WHITELIST or upper in allowed_extra:
            if _ENV_DENY_SUBSTRING_RE.search(upper) and upper not in ENV_WHITELIST:
                # Extra-allowed key that also matches a suspicious substring:
                # keep behavior conservative and reject.
                continue
            result[upper] = value
    return result


# ---------------------------------------------------------------------------
# config.yaml filtering
# ---------------------------------------------------------------------------

# Fields whose values must be re-derived per sub-agent rather than copied.
DERIVED_CONFIG_FIELDS: tuple[str, ...] = (
    "terminal.cwd",
    "workspace.path",
    "workspace_path",
    "profile.home",
    "profile_home",
)


def _path_matches(path: str, patterns: Iterable[str]) -> bool:
    """Check if a dotted path matches any pattern.

    A trailing ``.*`` matches the entire subtree below the prefix.
    A standalone ``*`` wildcard is not yet supported (only trailing).
    """
    for pattern in patterns:
        if pattern == path:
            return True
        if pattern.endswith(".*"):
            prefix = pattern[:-2]
            if path == prefix or path.startswith(prefix + "."):
                return True
    return False


def filter_config_yaml(config: dict) -> dict:
    """Return a deep copy of ``config`` with only whitelisted fields retained.

    Denylist overrides whitelist. Derived fields are always stripped.
    """
    if not isinstance(config, dict):
        return {}

    def walk(node: object, prefix: str) -> object | None:
        if isinstance(node, dict):
            kept: dict = {}
            for key, value in node.items():
                path = f"{prefix}.{key}" if prefix else str(key)
                if _path_matches(path, CONFIG_YAML_DENYLIST):
                    continue
                if _path_matches(path, DERIVED_CONFIG_FIELDS):
                    continue
                if _path_matches(path, CONFIG_YAML_WHITELIST):
                    kept[key] = value
                    continue
                # Descend: a parent may not be whitelisted literally but a
                # nested child could be (e.g. "model.default" under "model").
                descended = walk(value, path)
                if isinstance(descended, dict) and descended:
                    kept[key] = descended
                elif descended is not None and not isinstance(descended, dict):
                    # Leaf values below a whitelisted prefix are handled by
                    # _path_matches at their own path; nothing to do here.
                    pass
            return kept
        return None

    filtered = walk(config, "")
    return filtered if isinstance(filtered, dict) else {}


__all__ = [
    "CONFIG_YAML_WHITELIST",
    "CONFIG_YAML_DENYLIST",
    "DERIVED_CONFIG_FIELDS",
    "ENV_WHITELIST",
    "ENV_DENYLIST_LITERAL",
    "PROVIDER_ENV_KEYS",
    "RUNTIME_ENV_KEYS",
    "TOOL_ENV_KEYS",
    "filter_config_yaml",
    "filter_env",
    "is_env_key_allowed",
    "is_provider_id_valid",
    "provider_for_env_key",
]
