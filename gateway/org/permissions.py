"""
Organization Permission Checking

This module provides functions for verifying management permissions
and hierarchical relationships between agents.

Permission Model (2-tier):
1. Root Agent (me / user): Can assign tasks to ANY manager in the organization
2. Regular Managers: Can only assign tasks to their direct subordinates
"""

import sqlite3
from typing import Tuple, Optional

from .store import (
    OrganizationStore,
    AgentPermissionRepository,
    AgentRepository,
)


class PermissionError(Exception):
    """Raised when an agent does not have required permissions."""
    pass


def has_permission(
    store: OrganizationStore,
    agent_id: int,
    permission: str,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> bool:
    """
    Check if an agent has a specific permission.

    Args:
        store: OrganizationStore instance
        agent_id: ID of the agent to check
        permission: Permission name (e.g., "can_assign_tasks")
        conn: Optional database connection

    Returns:
        True if agent has the permission, False otherwise
    """
    perms_repo = AgentPermissionRepository(store)
    agent_perms = perms_repo.get_by_agent(agent_id, conn=conn)

    if not agent_perms:
        # No permissions record = no permissions
        return False

    return bool(agent_perms.get(permission, 0))


def require_management_permission(
    store: OrganizationStore,
    agent_id: int,
    permission: str,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> None:
    """
    Require that an agent has a specific permission.

    Raises:
        PermissionError: If agent does not have the permission
    """
    if not has_permission(store, agent_id, permission, conn=conn):
        raise PermissionError(
            f"Agent {agent_id} does not have permission: {permission}. "
            "Only management position agents can perform this action."
        )


def is_subordinate(
    store: OrganizationStore,
    manager_id: int,
    subordinate_id: int,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> bool:
    """
    Check if an agent is a direct subordinate of another agent.

    Checks direct manager_agent_id relationship.

    Args:
        store: OrganizationStore instance
        manager_id: ID of the potential manager
        subordinate_id: ID of the potential subordinate
        conn: Optional database connection

    Returns:
        True if subordinate_id reports directly to manager_id
    """
    agents = AgentRepository(store)

    subordinate = agents.get(subordinate_id, conn=conn)
    if not subordinate:
        return False

    # Check direct manager relationship
    if subordinate.get("manager_agent_id") == manager_id:
        return True

    return False


def _is_root_agent(
    store: OrganizationStore,
    agent_id: int,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> bool:
    """
    Check if this is a root-level agent (me / the user).

    Root agent characteristics:
    - Has no manager (manager_agent_id is None or 0)
    - OR is at the top level of the organization hierarchy
    """
    # Special case: Agent ID 0 or 1 typically means root / main agent
    if agent_id in (0, 1, None):
        return True

    agents = AgentRepository(store)
    agent = agents.get(agent_id, conn=conn)

    if not agent:
        return False

    # Check if at top of hierarchy (no manager)
    manager_id = agent.get("manager_agent_id")
    if manager_id is None or manager_id == 0:
        return True

    return False


def can_assign_to_agent(
    store: OrganizationStore,
    assigner_id: int,
    target_agent_id: int,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> Tuple[bool, str]:
    """
    Check if assigner can assign a task to target_agent.

    **2-tier Permission Model:**
    1. Root Agent (me / user): Can assign tasks to ANY manager in the organization
    2. Regular Managers: Can only assign to their direct subordinates

    Args:
        store: OrganizationStore instance
        assigner_id: ID of the agent assigning the task
        target_agent_id: ID of the agent receiving the task
        conn: Optional database connection

    Returns:
        (can_assign: bool, reason_message: str)
    """
    agents = AgentRepository(store)

    assigner = agents.get(assigner_id, conn=conn) if assigner_id else None
    target = agents.get(target_agent_id, conn=conn)

    if not target:
        return False, f"Target agent {target_agent_id} not found"

    # Check 1: Is this the ROOT AGENT (me)?
    if _is_root_agent(store, assigner_id, conn=conn):
        # Root agent can assign to ANY management position agent
        # First, check if target is a manager
        target_position = store.query_one(
            "SELECT is_management_position FROM positions WHERE id = ?",
            (target["position_id"],),
            conn=conn,
        )

        target_is_manager = (
            target_position
            and target_position.get("is_management_position")
            or target.get("leadership_role") in ("primary", "deputy")
        )

        if target_is_manager:
            target_name = target.get("display_name") or target.get("name") or f"Agent {target_agent_id}"
            return True, f"Root agent can assign tasks to any manager (including {target_name})"
        else:
            target_name = target.get("display_name") or target.get("name") or f"Agent {target_agent_id}"
            return False, (
                f"As root agent, you can only assign tasks to MANAGERS, not to individual contributors directly. "
                f"Please assign this task to {target_name}'s manager instead, "
                f"and they will delegate to their team members appropriately."
            )

    # Check 2: Regular manager - must have assign permission AND target is direct subordinate
    # First verify assigner has management permission
    if not has_permission(store, assigner_id, "can_assign_tasks", conn=conn):
        return False, f"Agent {assigner_id} does not have can_assign_tasks permission"

    # Then verify subordinate relationship
    if is_subordinate(store, assigner_id, target_agent_id, conn=conn):
        assigner_name = assigner.get("display_name") or assigner.get("name") or f"Agent {assigner_id}" if assigner else f"Agent {assigner_id}"
        target_name = target.get("display_name") or target.get("name") or f"Agent {target_agent_id}"
        return True, f"{target_name} is a direct subordinate of {assigner_name}"

    # Not allowed
    assigner_name = assigner.get("display_name") or assigner.get("name") or f"Agent {assigner_id}" if assigner else f"Agent {assigner_id}"
    target_name = target.get("display_name") or target.get("name") or f"Agent {target_agent_id}"
    return False, (
        f"{target_name} is not a direct subordinate of {assigner_name}. "
        f"You can only assign tasks to agents who report directly to you."
    )


def get_subordinates(
    store: OrganizationStore,
    manager_id: int,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> list:
    """
    Get all direct subordinates of a manager.

    Args:
        store: OrganizationStore instance
        manager_id: ID of the manager
        conn: Optional database connection

    Returns:
        List of subordinate agent records
    """
    # Get agents where manager_agent_id = manager_id
    all_agents = store.query_all(
        "SELECT * FROM agents WHERE manager_agent_id = ? AND status = 'active' AND enabled = 1 ORDER BY name",
        (manager_id,),
        conn=conn,
    )

    return all_agents
