"""Inheritance executor — applies master_agent_assets to sub-agent profiles.

Given a list of ``master_agent_assets`` rows tagged ``visibility = public``
and ``inherit_ready = 1``, apply each according to its ``inherit_mode``:

  * ``copy_to_workspace``  — copy source into ``{agent_workspace}/...``
  * ``copy_to_profile``    — copy source into ``{profile_home}/...``
  * ``merge_config``       — merge filtered YAML into ``profile_home/config.yaml``
                             OR whitelisted env vars into ``profile_home/.env``
  * ``inject_prompt``      — accumulate markdown snippets to later fold into
                             ``SOUL.md``

All writes are scoped to the sub-agent's own directories: we never write
back to the master agent's home.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .whitelist import (
    PROVIDER_ENV_KEYS,
    RUNTIME_ENV_KEYS,
    TOOL_ENV_KEYS,
    filter_config_yaml,
    filter_env,
    is_env_key_allowed,
)
from .assets import _parse_env_file, _safe_load_yaml


@dataclass
class InheritContext:
    """Where the sub-agent's inherited files should land."""

    profile_home: Path
    agent_workspace: Path | None = None


@dataclass
class InheritanceResult:
    applied: list[dict[str, Any]] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)
    prompt_snippets: list[str] = field(default_factory=list)

    def record_applied(self, asset: dict[str, Any], outcome: str, detail: str | None = None) -> None:
        self.applied.append(
            {
                "asset_type": asset.get("asset_type"),
                "asset_key": asset.get("asset_key"),
                "inherit_mode": asset.get("inherit_mode"),
                "outcome": outcome,
                "detail": detail,
            }
        )

    def record_skipped(self, asset: dict[str, Any], reason: str) -> None:
        self.skipped.append(
            {
                "asset_type": asset.get("asset_type"),
                "asset_key": asset.get("asset_key"),
                "inherit_mode": asset.get("inherit_mode"),
                "reason": reason,
            }
        )


class InheritanceApplier:
    """Applies a set of inheritable assets to a sub-agent's profile."""

    def __init__(self, *, master_home: Path | None = None):
        self._master_home = master_home

    # ------------------------------------------------------------------ API

    def master_home(self) -> Path | None:
        if self._master_home is not None:
            return self._master_home
        home = os.environ.get("HERMES_HOME", "").strip()
        return Path(home) if home else None

    def apply(
        self,
        assets: list[dict[str, Any]],
        context: InheritContext,
    ) -> InheritanceResult:
        result = InheritanceResult()
        context.profile_home.mkdir(parents=True, exist_ok=True)
        if context.agent_workspace is not None:
            context.agent_workspace.mkdir(parents=True, exist_ok=True)

        # Aggregate env/config merges then write once at the end so repeated
        # merge_config assets combine deterministically.
        config_merge: dict[str, Any] = {}
        env_merge: dict[str, str] = {}
        master_env = self._load_master_env()

        for asset in assets:
            mode = asset.get("inherit_mode") or "copy_to_profile"
            try:
                if mode == "copy_to_workspace":
                    self._copy_asset(asset, context.agent_workspace, result)
                elif mode == "copy_to_profile":
                    self._copy_asset(asset, context.profile_home, result)
                elif mode == "merge_config":
                    self._collect_merge(asset, master_env, config_merge, env_merge, result)
                elif mode == "inject_prompt":
                    self._collect_prompt(asset, result)
                else:
                    result.record_skipped(asset, f"Unknown inherit_mode: {mode}")
            except Exception as exc:  # noqa: BLE001 - surface as skipped
                result.record_skipped(asset, f"{type(exc).__name__}: {exc}")

        if config_merge:
            self._write_merged_config(context.profile_home / "config.yaml", config_merge, result)
        if env_merge:
            self._write_merged_env(context.profile_home / ".env", env_merge, result)

        return result

    # ------------------------------------------------------------- helpers

    def _load_master_env(self) -> dict[str, str]:
        home = self.master_home()
        if home is None:
            return {}
        return _parse_env_file(home / ".env")

    def _resolve_target(
        self,
        base: Path | None,
        template: str | None,
        asset: dict[str, Any],
    ) -> Path | None:
        if base is None:
            return None
        rel = (template or asset.get("asset_key") or "").format(
            asset_key=asset.get("asset_key", ""),
            asset_type=asset.get("asset_type", ""),
        )
        if not rel:
            return None
        rel_path = Path(rel)
        if rel_path.is_absolute():
            # Defense-in-depth: never allow absolute targets — this would let
            # an untrusted asset escape the sub-agent sandbox.
            return None
        target = (base / rel_path).resolve()
        try:
            target.relative_to(base.resolve())
        except ValueError:
            # Path traversal attempt via templates like "../../etc/..."
            return None
        return target

    def _copy_asset(
        self,
        asset: dict[str, Any],
        base: Path | None,
        result: InheritanceResult,
    ) -> None:
        if base is None:
            result.record_skipped(asset, "No target base directory for this inherit_mode")
            return
        source = asset.get("source_path")
        if not source:
            result.record_skipped(asset, "Asset has no source_path")
            return
        source_path = Path(source)
        if not source_path.exists():
            result.record_skipped(asset, f"Source does not exist: {source}")
            return
        target = self._resolve_target(base, asset.get("target_path_template"), asset)
        if target is None:
            result.record_skipped(asset, "Unable to resolve a safe target path")
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        if source_path.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(source_path, target)
        else:
            shutil.copy2(source_path, target)
        result.record_applied(asset, "copied", str(target))

    def _collect_merge(
        self,
        asset: dict[str, Any],
        master_env: dict[str, str],
        config_merge: dict[str, Any],
        env_merge: dict[str, str],
        result: InheritanceResult,
    ) -> None:
        asset_type = (asset.get("asset_type") or "").lower()
        asset_key = asset.get("asset_key") or ""
        fmt = (asset.get("source_format") or "").lower()
        source = asset.get("source_path")

        # --- per-provider env (new, preferred path) --------------------------
        if asset_type == "env_provider":
            provider_keys = PROVIDER_ENV_KEYS.get(asset_key)
            if not provider_keys:
                result.record_skipped(
                    asset, f"Unknown provider asset_key: {asset_key}"
                )
                return
            # Defense-in-depth: ``filter_env`` re-applies the code-level
            # ENV_WHITELIST + denylist + substring heuristics. Only keys that
            # survive *and* belong to this provider flow through.
            allowed = filter_env(master_env)
            subset = {
                k: v for k, v in allowed.items() if k in provider_keys and v
            }
            if subset:
                env_merge.update(subset)
                result.record_applied(
                    asset,
                    "merged_env_provider",
                    f"{asset_key}: {len(subset)} keys",
                )
            else:
                result.record_skipped(
                    asset,
                    f"Provider {asset_key} has no inheritable keys configured",
                )
            return

        if asset_type == "env_runtime":
            allowed = filter_env(master_env)
            subset = {
                k: v for k, v in allowed.items() if k in RUNTIME_ENV_KEYS and v
            }
            if subset:
                env_merge.update(subset)
                result.record_applied(
                    asset, "merged_env_runtime", f"{len(subset)} keys"
                )
            else:
                result.record_skipped(
                    asset, "No runtime env keys configured on master"
                )
            return

        if asset_type == "env_tools":
            allowed = filter_env(master_env)
            subset = {
                k: v for k, v in allowed.items() if k in TOOL_ENV_KEYS and v
            }
            if subset:
                env_merge.update(subset)
                result.record_applied(
                    asset, "merged_env_tools", f"{len(subset)} keys"
                )
            else:
                result.record_skipped(
                    asset, "No tool env keys configured on master"
                )
            return

        # --- legacy ``env_whitelist`` row (kept for transitional compat) -----
        # The scanner stopped emitting this row after the per-provider split,
        # but historical deployments may still carry it in SQLite. Honour the
        # operator's old visibility decision by falling through to the global
        # filter, gated (as before) by visibility/status in list_inheritable.
        if not source:
            result.record_skipped(asset, "merge_config asset has no source_path")
            return
        source_path = Path(source)

        if asset_key == "env_whitelist" or fmt == "env":
            allowed = filter_env(master_env)
            env_merge.update(allowed)
            result.record_applied(
                asset,
                "merged_env_legacy",
                f"{len(allowed)} whitelisted keys",
            )
            return

        if fmt in {"yaml", "yml"} or source_path.suffix.lower() in {".yaml", ".yml"}:
            raw = _safe_load_yaml(source_path)
            if raw is None:
                result.record_skipped(asset, "Unable to parse YAML source")
                return
            filtered = filter_config_yaml(raw)
            _deep_merge(config_merge, filtered)
            result.record_applied(
                asset,
                "merged_config",
                f"{len(filtered)} top-level keys",
            )
            return

        result.record_skipped(asset, f"Unsupported source_format for merge: {fmt}")

    def _collect_prompt(
        self,
        asset: dict[str, Any],
        result: InheritanceResult,
    ) -> None:
        source = asset.get("source_path")
        if not source:
            result.record_skipped(asset, "inject_prompt asset has no source_path")
            return
        source_path = Path(source)
        if not source_path.is_file():
            result.record_skipped(asset, "inject_prompt source is not a file")
            return
        try:
            text = source_path.read_text(encoding="utf-8")
        except OSError as exc:
            result.record_skipped(asset, f"Read failed: {exc}")
            return
        snippet = text.strip()
        if not snippet:
            result.record_skipped(asset, "Prompt snippet is empty")
            return
        header = asset.get("asset_name") or asset.get("asset_key") or "inherited"
        result.prompt_snippets.append(f"# {header}\n\n{snippet}")
        result.record_applied(asset, "prompt_queued", str(source_path))

    # --------------------------------------------------------------- writers

    def _write_merged_config(
        self,
        target: Path,
        merged: dict[str, Any],
        result: InheritanceResult,
    ) -> None:
        try:
            import yaml  # type: ignore
        except ImportError:
            result.skipped.append(
                {
                    "asset_type": "config",
                    "asset_key": "config_yaml",
                    "inherit_mode": "merge_config",
                    "reason": "PyYAML not installed; cannot serialize merged config",
                }
            )
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            yaml.safe_dump(merged, sort_keys=True, allow_unicode=True),
            encoding="utf-8",
        )

    def _write_merged_env(
        self,
        target: Path,
        merged: dict[str, str],
        result: InheritanceResult,
    ) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        lines = ["# Generated by sub-agent inheritance. Whitelisted keys only.\n"]
        for key in sorted(merged):
            if not is_env_key_allowed(key):
                continue
            value = merged[key]
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'{key}="{escaped}"\n')
        target.write_text("".join(lines), encoding="utf-8")


def _deep_merge(dest: dict[str, Any], src: dict[str, Any]) -> None:
    for key, value in src.items():
        if (
            key in dest
            and isinstance(dest[key], dict)
            and isinstance(value, dict)
        ):
            _deep_merge(dest[key], value)
        else:
            dest[key] = value


__all__ = [
    "InheritContext",
    "InheritanceApplier",
    "InheritanceResult",
]
