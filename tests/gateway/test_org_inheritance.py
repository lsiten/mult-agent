"""Tests for master-agent asset inheritance into sub-agents."""

from __future__ import annotations

from pathlib import Path

import pytest

from gateway.org import OrganizationService, OrganizationStore
from gateway.org.assets import MasterAgentAssetScanner
from gateway.org.bootstrap import BootstrapValidator
from gateway.org.inheritance import InheritanceApplier, InheritContext
from gateway.org.whitelist import (
    ENV_WHITELIST,
    PROVIDER_ENV_KEYS,
    RUNTIME_ENV_KEYS,
    TOOL_ENV_KEYS,
    filter_config_yaml,
    filter_env,
    is_env_key_allowed,
    is_provider_id_valid,
    provider_for_env_key,
)


# ---------------------------------------------------------------------------
# fixtures / helpers
# ---------------------------------------------------------------------------


def make_service(tmp_path: Path) -> OrganizationService:
    return OrganizationService(OrganizationStore(tmp_path / "org.db"))


def make_master_home(tmp_path: Path) -> Path:
    """Build a fake master HERMES_HOME with a config.yaml, .env, and one skill."""
    home = tmp_path / "master-home"
    home.mkdir()
    (home / "config.yaml").write_text(
        "model:\n  default: gpt-4o\n  provider: openrouter\n"
        "terminal:\n  backend: docker\n  timeout: 600\n  cwd: /tmp/should-not-leak\n"
        "auth:\n  oauth_token: DO_NOT_LEAK\n",
        encoding="utf-8",
    )
    (home / ".env").write_text(
        "OPENROUTER_API_KEY=sk-test-inheritable\n"
        "TERMINAL_TIMEOUT=900\n"
        "ACCESS_TOKEN=must_not_leak\n"
        "SUDO_PASSWORD=must_not_leak\n",
        encoding="utf-8",
    )
    skill_dir = home / "skills" / "hello-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("# Hello skill\nSay hi.", encoding="utf-8")
    return home


# ---------------------------------------------------------------------------
# whitelist tests
# ---------------------------------------------------------------------------


class TestWhitelist:
    def test_is_env_key_allowed_accepts_known_provider(self) -> None:
        assert is_env_key_allowed("OPENROUTER_API_KEY")

    def test_is_env_key_allowed_rejects_literal_denylist(self) -> None:
        assert not is_env_key_allowed("SUDO_PASSWORD")
        assert not is_env_key_allowed("TERMINAL_CWD")

    def test_is_env_key_allowed_rejects_suspicious_substring(self) -> None:
        assert not is_env_key_allowed("ACCESS_TOKEN")
        assert not is_env_key_allowed("SLACK_WEBHOOK")

    def test_is_env_key_allowed_requires_shell_identifier(self) -> None:
        assert not is_env_key_allowed("lowercase_key")
        assert not is_env_key_allowed("HAS SPACE")
        assert not is_env_key_allowed("")

    def test_filter_env_keeps_only_allowed(self) -> None:
        env = {
            "OPENROUTER_API_KEY": "sk",
            "TERMINAL_TIMEOUT": "900",
            "ACCESS_TOKEN": "x",
            "SUDO_PASSWORD": "x",
            "RANDOM_VALUE": "y",
        }
        result = filter_env(env)
        assert result == {
            "OPENROUTER_API_KEY": "sk",
            "TERMINAL_TIMEOUT": "900",
        }

    def test_provider_env_keys_subset_of_whitelist(self) -> None:
        # Invariant every review must preserve: the per-provider map can never
        # widen inheritance beyond the vetted whitelist.
        for provider, keys in PROVIDER_ENV_KEYS.items():
            missing = keys - ENV_WHITELIST
            assert not missing, f"{provider} leaks keys outside ENV_WHITELIST: {missing}"

    def test_provider_env_keys_pairwise_disjoint(self) -> None:
        seen: dict[str, str] = {}
        for provider, keys in PROVIDER_ENV_KEYS.items():
            for key in keys:
                assert key not in seen, (
                    f"{key} mapped to both {seen[key]} and {provider}"
                )
                seen[key] = provider

    def test_runtime_and_tool_buckets_disjoint_from_providers(self) -> None:
        provider_keys = {k for keys in PROVIDER_ENV_KEYS.values() for k in keys}
        assert not (RUNTIME_ENV_KEYS & provider_keys)
        assert not (TOOL_ENV_KEYS & provider_keys)

    def test_provider_for_env_key_roundtrip(self) -> None:
        assert provider_for_env_key("OPENROUTER_API_KEY") == "openrouter"
        assert provider_for_env_key("ARK_API_KEY") == "volcengine"
        assert provider_for_env_key("NOT_IN_MAP") is None

    def test_is_provider_id_valid(self) -> None:
        assert is_provider_id_valid("openrouter")
        # Unregistered id returns False even if syntactically valid.
        assert not is_provider_id_valid("made_up_provider")
        # Path traversal style ids must be rejected before hitting the DB.
        assert not is_provider_id_valid("../etc/passwd")
        assert not is_provider_id_valid("")

    def test_filter_config_yaml_drops_derived_and_denylist(self) -> None:
        raw = {
            "model": {"default": "gpt-4o", "provider": "openrouter"},
            "terminal": {"backend": "docker", "cwd": "/leak", "timeout": 600},
            "auth": {"oauth_token": "LEAK"},
            "session": {"id": "abc"},
        }
        filtered = filter_config_yaml(raw)
        assert filtered == {
            "model": {"default": "gpt-4o", "provider": "openrouter"},
            "terminal": {"backend": "docker", "timeout": 600},
        }
        # Traversal guard
        assert "auth" not in filtered
        assert "session" not in filtered
        assert "cwd" not in filtered["terminal"]


# ---------------------------------------------------------------------------
# scanner tests
# ---------------------------------------------------------------------------


class TestScanner:
    def test_scan_discovers_skill_config_and_env(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        scanner = MasterAgentAssetScanner(
            service.store,
            service.master_assets,
            master_home=master_home,
        )

        report = scanner.scan()

        # skill + config_yaml + one env_provider per registered provider
        # + env_runtime + env_tools
        expected_scanned = 2 + len(PROVIDER_ENV_KEYS) + 2
        assert report.scanned == expected_scanned
        assert report.created == expected_scanned
        assert report.updated == 0

        rows = service.master_assets.list(status=None)
        keys = {(r["asset_type"], r["asset_key"]) for r in rows}
        assert ("skill", "hello-skill") in keys
        assert ("config", "config_yaml") in keys
        # Each registered provider gets its own row, regardless of whether a
        # key was actually configured (so operators can pre-toggle).
        for provider_id in PROVIDER_ENV_KEYS:
            assert ("env_provider", provider_id) in keys
        assert ("env_runtime", "terminal") in keys
        assert ("env_tools", "research") in keys

    def test_scan_marks_configured_provider_bootstrap_required(
        self, tmp_path: Path
    ) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        scanner = MasterAgentAssetScanner(
            service.store,
            service.master_assets,
            master_home=master_home,
        )
        scanner.scan()

        # The fake master .env defines OPENROUTER_API_KEY so that provider row
        # must be inherit_ready=1 and is_bootstrap_required=1.
        row = service.master_assets.get_by_key("env_provider", "openrouter")
        assert row is not None
        assert row["inherit_ready"] == 1
        assert row["is_bootstrap_required"] == 1

        # A provider with no configured keys (e.g. kimi) gets a row but it is
        # explicitly not ready — so the UI can hide the Public/Private toggle
        # and the server can reject attempts to mark it public.
        kimi = service.master_assets.get_by_key("env_provider", "kimi")
        assert kimi is not None
        assert kimi["inherit_ready"] == 0
        assert kimi["validation_status"] == "warning"

    def test_scan_preserves_visibility_across_runs(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        scanner = MasterAgentAssetScanner(
            service.store,
            service.master_assets,
            master_home=master_home,
        )
        scanner.scan()

        row = service.master_assets.get_by_key("skill", "hello-skill")
        service.update_master_asset(row["id"], {"visibility": "public"})

        # Re-scan must NOT reset operator-controlled visibility.
        report = scanner.scan()
        assert report.created == 0
        after = service.master_assets.get_by_key("skill", "hello-skill")
        assert after["visibility"] == "public"

    def test_scan_marks_removed_sources_as_stale(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        scanner = MasterAgentAssetScanner(
            service.store,
            service.master_assets,
            master_home=master_home,
        )
        scanner.scan()

        # Delete the skill on disk
        import shutil
        shutil.rmtree(master_home / "skills" / "hello-skill")

        report = scanner.scan()
        assert report.removed == 1
        row = service.master_assets.get_by_key("skill", "hello-skill")
        assert row["status"] == "stale"
        assert row["inherit_ready"] == 0


# ---------------------------------------------------------------------------
# inheritance applier tests
# ---------------------------------------------------------------------------


class TestInheritance:
    def _build_assets(
        self,
        service: OrganizationService,
        master_home: Path,
    ) -> list[dict]:
        # Register three public inheritable assets covering three modes.
        skill_dir = master_home / "skills" / "hello-skill"
        prompt_file = master_home / "prompts" / "extra.md"
        prompt_file.parent.mkdir(parents=True, exist_ok=True)
        prompt_file.write_text("Always double-check your work.", encoding="utf-8")

        def tx(conn):
            service.master_assets.upsert(
                {
                    "asset_type": "skill",
                    "asset_key": "hello-skill",
                    "source_path": str(skill_dir),
                    "source_format": "directory",
                    "visibility": "public",
                    "inherit_mode": "copy_to_profile",
                    "target_path_template": "skills/{asset_key}",
                    "inherit_ready": 1,
                    "validation_status": "ready",
                },
                conn,
            )
            service.master_assets.upsert(
                {
                    "asset_type": "config",
                    "asset_key": "config_yaml",
                    "source_path": str(master_home / "config.yaml"),
                    "source_format": "yaml",
                    "visibility": "public",
                    "inherit_mode": "merge_config",
                    "target_path_template": "config.yaml",
                    "inherit_ready": 1,
                    "validation_status": "ready",
                },
                conn,
            )
            service.master_assets.upsert(
                {
                    "asset_type": "config",
                    "asset_key": "env_whitelist",
                    "source_path": str(master_home / ".env"),
                    "source_format": "env",
                    "visibility": "public",
                    "inherit_mode": "merge_config",
                    "target_path_template": ".env",
                    "inherit_ready": 1,
                    "is_bootstrap_required": 1,
                    "validation_status": "ready",
                },
                conn,
            )
            service.master_assets.upsert(
                {
                    "asset_type": "resource",
                    "asset_key": "prompt-extra",
                    "asset_name": "Extra prompt",
                    "source_path": str(prompt_file),
                    "source_format": "markdown",
                    "visibility": "public",
                    "inherit_mode": "inject_prompt",
                    "inherit_ready": 1,
                    "validation_status": "ready",
                },
                conn,
            )

        service.store.transaction(tx)
        return service.master_assets.list_inheritable()

    def test_apply_all_modes(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        assets = self._build_assets(service, master_home)
        assert len(assets) == 4

        profile_home = tmp_path / "profile"
        workspace = tmp_path / "workspace"
        applier = InheritanceApplier(master_home=master_home)
        result = applier.apply(
            assets,
            InheritContext(profile_home=profile_home, agent_workspace=workspace),
        )

        # skill copied into profile
        assert (profile_home / "skills" / "hello-skill" / "SKILL.md").is_file()
        # config merged (whitelisted fields only)
        config_text = (profile_home / "config.yaml").read_text(encoding="utf-8")
        assert "default: gpt-4o" in config_text
        assert "oauth_token" not in config_text
        assert "cwd:" not in config_text
        # env merged (whitelisted only)
        env_text = (profile_home / ".env").read_text(encoding="utf-8")
        assert "OPENROUTER_API_KEY=" in env_text
        assert "SUDO_PASSWORD" not in env_text
        assert "ACCESS_TOKEN" not in env_text
        # prompt snippet queued, not written
        assert any("double-check" in s for s in result.prompt_snippets)
        assert not (profile_home / "prompts").exists()

    def test_env_provider_only_merges_matching_keys(self, tmp_path: Path) -> None:
        """``env_provider/openrouter`` must not leak ARK or KIMI keys into .env."""
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        # Add a second provider key to the master's .env so we can prove the
        # provider row for OpenRouter refuses to export it.
        env_file = master_home / ".env"
        env_file.write_text(
            env_file.read_text(encoding="utf-8")
            + "ARK_API_KEY=sk-ark-SHOULD-NOT-LEAK\n",
            encoding="utf-8",
        )

        def tx(conn):
            service.master_assets.upsert(
                {
                    "asset_type": "env_provider",
                    "asset_key": "openrouter",
                    "source_path": str(env_file),
                    "source_format": "env",
                    "visibility": "public",
                    "inherit_mode": "merge_config",
                    "target_path_template": ".env",
                    "inherit_ready": 1,
                    "is_bootstrap_required": 1,
                    "validation_status": "ready",
                },
                conn,
            )

        service.store.transaction(tx)
        assets = service.master_assets.list_inheritable()
        profile_home = tmp_path / "profile-env"
        applier = InheritanceApplier(master_home=master_home)
        applier.apply(assets, InheritContext(profile_home=profile_home))

        env_text = (profile_home / ".env").read_text(encoding="utf-8")
        assert "OPENROUTER_API_KEY=" in env_text
        assert "sk-test-inheritable" in env_text
        assert "ARK_API_KEY" not in env_text, (
            "env_provider/openrouter must not leak ARK_* keys"
        )
        assert "SHOULD-NOT-LEAK" not in env_text

    def test_env_provider_unknown_id_is_skipped(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)

        def tx(conn):
            service.master_assets.upsert(
                {
                    "asset_type": "env_provider",
                    "asset_key": "definitely-not-a-provider",
                    "source_path": str(master_home / ".env"),
                    "source_format": "env",
                    "visibility": "public",
                    "inherit_mode": "merge_config",
                    "target_path_template": ".env",
                    "inherit_ready": 1,
                    "validation_status": "ready",
                },
                conn,
            )

        service.store.transaction(tx)
        assets = service.master_assets.list_inheritable()
        profile_home = tmp_path / "profile-unknown"
        applier = InheritanceApplier(master_home=master_home)
        result = applier.apply(assets, InheritContext(profile_home=profile_home))

        assert any("Unknown provider asset_key" in s["reason"] for s in result.skipped)
        assert not (profile_home / ".env").exists()

    def test_private_provider_is_not_inherited(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        scanner = MasterAgentAssetScanner(
            service.store,
            service.master_assets,
            master_home=master_home,
        )
        scanner.scan()

        # Leave openrouter Private (the default) and mark only an unrelated
        # asset Public so list_inheritable has work to do.
        config_row = service.master_assets.get_by_key("config", "config_yaml")
        service.update_master_asset(config_row["id"], {"visibility": "public"})

        assets = service.master_assets.list_inheritable()
        assert not any(
            a["asset_type"] == "env_provider" for a in assets
        ), "Private env_provider rows must not appear in list_inheritable"

        profile_home = tmp_path / "profile-private"
        applier = InheritanceApplier(master_home=master_home)
        applier.apply(assets, InheritContext(profile_home=profile_home))

        # config.yaml was public so the file exists, but .env should not.
        assert (profile_home / "config.yaml").is_file()
        assert not (profile_home / ".env").exists()

    def test_apply_blocks_path_traversal(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        skill_dir = master_home / "skills" / "hello-skill"
        evil = [
            {
                "asset_type": "skill",
                "asset_key": "hello-skill",
                "source_path": str(skill_dir),
                "source_format": "directory",
                "inherit_mode": "copy_to_profile",
                "target_path_template": "../../etc/pwned",
            }
        ]
        profile_home = tmp_path / "profile"
        applier = InheritanceApplier(master_home=master_home)
        result = applier.apply(
            evil,
            InheritContext(profile_home=profile_home),
        )
        assert any("safe target path" in s["reason"] for s in result.skipped)


# ---------------------------------------------------------------------------
# end-to-end provision tests
# ---------------------------------------------------------------------------


class TestProvisionEndToEnd:
    def test_provision_copies_inheritable_assets_into_profile(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)

        # Stamp a master home + scan + mark everything public.
        service.asset_scanner._master_home = master_home  # type: ignore[attr-defined]
        service.profile_service.applier._master_home = master_home  # type: ignore[attr-defined]
        service.asset_scanner.scan()
        for row in service.master_assets.list():
            service.update_master_asset(row["id"], {"visibility": "public"})

        company = service.create_company({"name": "Co", "goal": "G"})
        department = service.create_department(
            {"company_id": company["id"], "name": "Dept", "goal": "DG"}
        )
        position = service.create_position(
            {
                "department_id": department["id"],
                "name": "Pos",
                "responsibilities": "R",
            }
        )
        agent = service.create_agent(
            {"position_id": position["id"], "name": "A", "role_summary": "RS"}
        )

        assert agent["profile_agent"]["profile_status"] == "ready"
        profile_home = Path(agent["profile_agent"]["profile_home"])
        assert (profile_home / "SOUL.md").is_file()
        assert (profile_home / "organization.json").is_file()
        # merged env from master's whitelisted keys
        env_text = (profile_home / ".env").read_text(encoding="utf-8")
        assert "OPENROUTER_API_KEY=" in env_text
        assert "SUDO_PASSWORD" not in env_text
        # skill copied across
        assert (profile_home / "skills" / "hello-skill" / "SKILL.md").is_file()

    def test_bootstrap_check_reports_issues_for_bad_state(self, tmp_path: Path) -> None:
        service = make_service(tmp_path)
        company = service.create_company({"name": "Co", "goal": "G"})
        department = service.create_department(
            {"company_id": company["id"], "name": "D", "goal": "DG"}
        )
        position = service.create_position(
            {
                "department_id": department["id"],
                "name": "P",
                "responsibilities": "R",
            }
        )
        # Put something into master_agent_assets to exit the "bootstrap phase"
        # (so the validator enters strict mode).
        def seed(conn):
            service.master_assets.upsert(
                {
                    "asset_type": "skill",
                    "asset_key": "private-only",
                    "source_path": str(tmp_path / "private"),
                    "source_format": "directory",
                    "visibility": "private",
                    "inherit_ready": 0,
                },
                conn,
            )

        service.store.transaction(seed)

        report = service.bootstrap_check_position(position["id"])
        assert not report["can_bootstrap"]
        keys = {i["requirement_key"] for i in report["issues"]}
        assert {"provider_api_key", "any_public_asset"}.issubset(keys)


class TestSetProviderVisibility:
    """Service-level invariants for the per-provider toggle."""

    def _seed(self, tmp_path: Path) -> OrganizationService:
        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        service.asset_scanner._master_home = master_home  # type: ignore[attr-defined]
        service.asset_scanner.scan()
        return service

    def test_flip_to_public_for_configured_provider(self, tmp_path: Path) -> None:
        service = self._seed(tmp_path)
        updated = service.set_provider_visibility("openrouter", "public")
        assert updated["visibility"] == "public"
        assert updated["asset_type"] == "env_provider"

    def test_reject_public_for_unconfigured_provider(self, tmp_path: Path) -> None:
        from gateway.org.services import OrganizationError

        service = self._seed(tmp_path)
        # kimi has no key in the fake master's .env, so the scanner left
        # inherit_ready=0; flipping to public must fail.
        with pytest.raises(OrganizationError) as excinfo:
            service.set_provider_visibility("kimi", "public")
        assert excinfo.value.status == 400
        # But flipping to private (back to default) is always fine.
        res = service.set_provider_visibility("kimi", "private")
        assert res["visibility"] == "private"

    def test_reject_unknown_provider_id(self, tmp_path: Path) -> None:
        from gateway.org.services import OrganizationError

        service = self._seed(tmp_path)
        with pytest.raises(OrganizationError) as excinfo:
            service.set_provider_visibility("definitely-not-real", "public")
        assert excinfo.value.status == 404

    def test_reject_invalid_visibility_value(self, tmp_path: Path) -> None:
        from gateway.org.services import OrganizationError

        service = self._seed(tmp_path)
        with pytest.raises(OrganizationError):
            service.set_provider_visibility("openrouter", "world-readable")  # type: ignore[arg-type]


class TestResolveChatProfile:
    def test_returns_none_for_missing_agent(self, tmp_path: Path) -> None:
        from gateway.org.runtime import resolve_chat_profile

        service = make_service(tmp_path)
        assert resolve_chat_profile(9999, store=service.store) is None

    def test_ready_profile_exposes_model_and_api_key(self, tmp_path: Path) -> None:
        from gateway.org.runtime import resolve_chat_profile

        service = make_service(tmp_path)
        master_home = make_master_home(tmp_path)
        service.asset_scanner._master_home = master_home  # type: ignore[attr-defined]
        service.profile_service.applier._master_home = master_home  # type: ignore[attr-defined]
        service.asset_scanner.scan()
        for row in service.master_assets.list():
            service.update_master_asset(row["id"], {"visibility": "public"})

        company = service.create_company({"name": "Co", "goal": "G"})
        dept = service.create_department(
            {"company_id": company["id"], "name": "D", "goal": "DG"}
        )
        pos = service.create_position(
            {"department_id": dept["id"], "name": "P", "responsibilities": "R"}
        )
        agent = service.create_agent(
            {"position_id": pos["id"], "name": "A", "role_summary": "RS"}
        )
        assert agent["profile_agent"]["profile_status"] == "ready"

        resolved = resolve_chat_profile(agent["id"], store=service.store)
        assert resolved is not None
        assert resolved.is_ready()
        assert resolved.model == "gpt-4o"
        assert resolved.provider == "openrouter"
        assert resolved.api_key == "sk-test-inheritable"
        assert resolved.display["name"] == "A"

    def test_pending_profile_reports_status(self, tmp_path: Path) -> None:
        from gateway.org.runtime import resolve_chat_profile

        service = make_service(tmp_path)
        company = service.create_company({"name": "Co", "goal": "G"})
        dept = service.create_department(
            {"company_id": company["id"], "name": "D", "goal": "DG"}
        )
        pos = service.create_position(
            {"department_id": dept["id"], "name": "P", "responsibilities": "R"}
        )
        # Bootstrap-phase clean DB -> profile likely "ready" too, so force a
        # pending status by manually creating the agent without provisioned
        # artifacts.
        agent = service.create_agent(
            {"position_id": pos["id"], "name": "A", "role_summary": "RS"}
        )
        # Flip status to simulate a not-yet-ready profile.
        service.store.execute(
            "UPDATE profile_agents SET profile_status = ? WHERE agent_id = ?",
            ("pending", agent["id"]),
        )

        resolved = resolve_chat_profile(agent["id"], store=service.store)
        assert resolved is not None
        assert not resolved.is_ready()
        assert resolved.model is None
