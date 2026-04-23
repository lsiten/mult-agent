"""Dynamic bootstrap validation for sub-agent provisioning.

Given an organizational scope (position/department/company), decide whether
a one-click sub-agent can be generated right now. The validator combines
three truth sources from the design doc (§16.2.1):

  1. ``profile_templates`` — is a resolvable template available?
  2. ``master_agent_assets`` — is there at least one public Provider key
     and at least one inheritable skill/tool/config?
  3. SQLite organization rows — is the parent chain structurally complete?

Results are both returned to the caller **and** mirrored back into the
``subagent_bootstrap_requirements`` table so operators can see the
historical validation state for each scope/template pair.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .store import (
    MasterAgentAssetRepository,
    OrganizationStore,
    ProfileTemplateRepository,
    SubagentBootstrapRequirementRepository,
    now_ts,
)


@dataclass
class BootstrapIssue:
    requirement_type: str   # asset / sql_field / profile_file / env_key / config_key
    requirement_key: str
    required_level: str     # required / optional
    expected_source: str    # profile_template / master_agent_assets / sqlite
    message: str            # human-readable diagnostic
    suggestion: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "requirement_type": self.requirement_type,
            "requirement_key": self.requirement_key,
            "required_level": self.required_level,
            "expected_source": self.expected_source,
            "message": self.message,
            "suggestion": self.suggestion,
        }


@dataclass
class BootstrapResult:
    can_bootstrap: bool
    issues: list[BootstrapIssue] = field(default_factory=list)
    warnings: list[BootstrapIssue] = field(default_factory=list)
    template: dict[str, Any] | None = None
    inheritable_asset_count: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "can_bootstrap": self.can_bootstrap,
            "issues": [i.as_dict() for i in self.issues],
            "warnings": [w.as_dict() for w in self.warnings],
            "template": self.template,
            "inheritable_asset_count": self.inheritable_asset_count,
        }

    @property
    def required_messages(self) -> list[str]:
        return [f"{i.requirement_type}:{i.message}" for i in self.issues]


class BootstrapValidator:
    """Runs the six minimum-viable checks from design doc §16.2.1."""

    def __init__(
        self,
        store: OrganizationStore,
        *,
        templates: ProfileTemplateRepository | None = None,
        assets: MasterAgentAssetRepository | None = None,
        requirements: SubagentBootstrapRequirementRepository | None = None,
    ):
        self.store = store
        self.templates = templates or ProfileTemplateRepository(store)
        self.assets = assets or MasterAgentAssetRepository(store)
        self.requirements = requirements or SubagentBootstrapRequirementRepository(store)

    # -------------------------------------------------------- public API

    def validate_position(
        self,
        position_id: int,
        conn: sqlite3.Connection | None = None,
    ) -> BootstrapResult:
        """Run checks for a specific position, persist results, return verdict."""
        if conn is None:
            return self.store.transaction(lambda c: self._validate_position(c, position_id))
        return self._validate_position(conn, position_id)

    # ----------------------------------------------------- implementation

    def _validate_position(
        self,
        conn: sqlite3.Connection,
        position_id: int,
    ) -> BootstrapResult:
        position = self.store.query_one(
            "SELECT * FROM positions WHERE id = ?",
            (position_id,),
            conn,
        )
        if not position:
            issue = BootstrapIssue(
                requirement_type="sql_field",
                requirement_key="positions.id",
                required_level="required",
                expected_source="sqlite",
                message=f"Position id={position_id} not found",
                suggestion="Create the position first",
            )
            return BootstrapResult(can_bootstrap=False, issues=[issue])

        department = self.store.query_one(
            "SELECT * FROM departments WHERE id = ?",
            (position["department_id"],),
            conn,
        )
        company = None
        if department:
            company = self.store.query_one(
                "SELECT * FROM companies WHERE id = ?",
                (department["company_id"],),
                conn,
            )

        issues: list[BootstrapIssue] = []
        warnings: list[BootstrapIssue] = []

        # Check 1: structural truth — position / department / company chain.
        if not department:
            issues.append(
                BootstrapIssue(
                    "sql_field",
                    "positions.department_id",
                    "required",
                    "sqlite",
                    "Position is not linked to an existing department",
                    "Re-save the position under a valid department",
                )
            )
        if not company:
            issues.append(
                BootstrapIssue(
                    "sql_field",
                    "departments.company_id",
                    "required",
                    "sqlite",
                    "Department is not linked to an existing company",
                    "Create or re-link the parent company",
                )
            )

        # Check 2: field completeness on position / department / company.
        if department and not (department.get("goal") or "").strip():
            issues.append(
                BootstrapIssue(
                    "sql_field",
                    "departments.goal",
                    "required",
                    "sqlite",
                    "Department goal is empty",
                    "Set a one-line department goal",
                )
            )
        if company and not (company.get("goal") or "").strip():
            issues.append(
                BootstrapIssue(
                    "sql_field",
                    "companies.goal",
                    "required",
                    "sqlite",
                    "Company goal is empty",
                    "Set a one-line company goal",
                )
            )
        if not (position.get("responsibilities") or "").strip():
            issues.append(
                BootstrapIssue(
                    "sql_field",
                    "positions.responsibilities",
                    "required",
                    "sqlite",
                    "Position responsibilities are empty",
                    "Fill in the position responsibilities",
                )
            )

        # Check 3: profile template availability.
        #
        # If the ``profile_templates`` table has never been populated, fall
        # back to the built-in SOUL renderer (bootstrap phase) instead of
        # blocking. Once at least one template exists we enforce that the
        # position must resolve one.
        template = self.templates.resolve(
            template_key=position.get("template_key"),
            position_id=position["id"],
            department_id=position["department_id"],
            company_id=department["company_id"] if department else None,
            conn=conn,
        )
        if not template:
            total_templates = self.store.query_one(
                "SELECT COUNT(*) AS n FROM profile_templates",
                (),
                conn,
            )
            if total_templates and total_templates["n"]:
                issues.append(
                    BootstrapIssue(
                        "profile_file",
                        "profile_template",
                        "required",
                        "profile_template",
                        "No profile template available for this position",
                        "Create a system/company/department/position-scoped template",
                    )
                )
            else:
                warnings.append(
                    BootstrapIssue(
                        "profile_file",
                        "profile_template",
                        "optional",
                        "profile_template",
                        "profile_templates is empty — provisioning uses built-in default",
                        "POST /api/org/profile-templates to register templates",
                    )
                )

        # Check 4 + 5: inheritable master assets.
        #
        # Two-phase behavior:
        #   - "bootstrap phase": the master_agent_assets table has never been
        #     populated (zero rows). The operator is still onboarding and we
        #     allow provisioning with *no* inheritance — only a template.
        #   - "managed phase": at least one row exists. The operator has
        #     started curating assets, so we strictly require ≥1 public key
        #     + ≥1 inheritable asset.
        total_assets = self.store.query_one(
            "SELECT COUNT(*) AS n FROM master_agent_assets",
            (),
            conn,
        )
        has_any_asset = bool(total_assets and total_assets["n"])
        inheritable = self.assets.list_inheritable(conn)

        if has_any_asset:
            provider_assets = self._inheritable_env_assets(conn)
            if not any(a.get("is_bootstrap_required") for a in provider_assets):
                issues.append(
                    BootstrapIssue(
                        "env_key",
                        "provider_api_key",
                        "required",
                        "master_agent_assets",
                        "No Provider is marked Public for new agents",
                        "Flip at least one provider toggle to Public on the "
                        "master agent's Env page",
                    )
                )
            if not inheritable:
                issues.append(
                    BootstrapIssue(
                        "asset",
                        "any_public_asset",
                        "required",
                        "master_agent_assets",
                        "Master agent has no public assets available for inheritance",
                        "Mark at least one skill/tool/config asset as public",
                    )
                )
        else:
            warnings.append(
                BootstrapIssue(
                    "asset",
                    "any_public_asset",
                    "optional",
                    "master_agent_assets",
                    "master_agent_assets is empty — provisioning uses template only",
                    "Run POST /api/org/assets/refresh then mark assets public",
                )
            )

        # Check 6: workspace creatability (soft warning — we can't create dirs
        # outside a transaction, so just verify the configured org root is
        # writable).
        org_root = self.store.org_root
        try:
            org_root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            issues.append(
                BootstrapIssue(
                    "config_key",
                    "org_root",
                    "required",
                    "sqlite",
                    f"Organization root is not writable: {exc}",
                    "Fix filesystem permissions",
                )
            )

        # Fold in operator-defined requirements that already live in the
        # subagent_bootstrap_requirements table.
        operator_rows = self.store.query_all(
            """
            SELECT * FROM subagent_bootstrap_requirements
            WHERE required_level = 'required'
              AND (
                scope_type = 'system'
                OR (scope_type = 'position' AND scope_id = ?)
                OR (scope_type = 'template' AND template_key = ?)
              )
            """,
            (position["id"], position.get("template_key")),
            conn,
        )
        for row in operator_rows:
            if row["validation_status"] not in ("ready", "ok"):
                issues.append(
                    BootstrapIssue(
                        row["requirement_type"],
                        row["requirement_key"],
                        row["required_level"],
                        row["expected_source"],
                        row.get("validation_message") or row["requirement_key"],
                        None,
                    )
                )

        can_bootstrap = not issues
        result = BootstrapResult(
            can_bootstrap=can_bootstrap,
            issues=issues,
            warnings=warnings,
            template=template,
            inheritable_asset_count=len(inheritable),
        )

        self._persist_validation(conn, position, result)
        return result

    def _inheritable_env_assets(
        self,
        conn: sqlite3.Connection,
    ) -> list[dict[str, Any]]:
        """Provider rows eligible to satisfy bootstrap's "public API key" check.

        We recognise both the new ``env_provider`` rows (per-provider toggles)
        and the legacy ``config/env_whitelist`` row. Legacy rows that are still
        Public are treated as providing a key as long as they are marked as
        bootstrap-required by the scanner.
        """
        out: list[dict[str, Any]] = []
        for asset in self.assets.list_inheritable(conn):
            asset_type = asset.get("asset_type")
            asset_key = asset.get("asset_key")
            if asset_type == "env_provider":
                out.append(asset)
            elif asset_type == "config" and asset_key == "env_whitelist":
                out.append(asset)
        return out

    def _persist_validation(
        self,
        conn: sqlite3.Connection,
        position: dict[str, Any],
        result: BootstrapResult,
    ) -> None:
        """Mirror the validator's verdict into ``subagent_bootstrap_requirements``.

        We never remove operator-authored rows; we only create/update
        entries tagged as produced by this validator via
        ``expected_source = 'validator'``.
        """
        ts = now_ts()
        validator_rows = self.store.query_all(
            """
            SELECT * FROM subagent_bootstrap_requirements
            WHERE scope_type = 'position' AND scope_id = ?
              AND expected_source = 'validator'
            """,
            (position["id"],),
            conn,
        )
        existing_by_key = {row["requirement_key"]: row for row in validator_rows}

        seen_keys: set[str] = set()
        for issue in result.issues:
            seen_keys.add(issue.requirement_key)
            row = existing_by_key.get(issue.requirement_key)
            if row:
                self.requirements.patch(
                    row["id"],
                    {
                        "validation_status": "missing",
                        "validation_message": issue.message,
                        "last_validated_at": ts,
                    },
                    conn,
                )
            else:
                self.requirements.create(
                    {
                        "scope_type": "position",
                        "scope_id": position["id"],
                        "template_key": position.get("template_key"),
                        "requirement_type": issue.requirement_type,
                        "requirement_key": issue.requirement_key,
                        "required_level": issue.required_level,
                        "expected_source": "validator",
                        "validation_status": "missing",
                        "validation_message": issue.message,
                        "last_validated_at": ts,
                    },
                    conn,
                )

        # Mark previously-missing validator rows as ready when they no longer
        # appear in this run's issues.
        for key, row in existing_by_key.items():
            if key in seen_keys:
                continue
            if row["validation_status"] != "ready":
                self.requirements.patch(
                    row["id"],
                    {
                        "validation_status": "ready",
                        "validation_message": None,
                        "last_validated_at": ts,
                    },
                    conn,
                )


__all__ = [
    "BootstrapIssue",
    "BootstrapResult",
    "BootstrapValidator",
]
