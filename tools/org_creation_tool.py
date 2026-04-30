"""Organization Creation Tools

This module provides tools for creating organization elements:
- Departments, Positions, and Agents.

Tools call OrganizationService which handles:
- Parameter validation (_require())
- Workspace initialization (workspace_service.ensure_workspace())
- Agent Profile setup (profile_service.create_metadata() + agent_provision.provision_profile())"""

import json
import logging
from typing import Any, Dict

from tools.registry import registry

logger = logging.getLogger(__name__)


def _get_org_service():
    """Get OrganizationService instance."""
    from gateway.org.store import OrganizationStore
    from gateway.org.services import OrganizationService

    store = OrganizationStore()
    service = OrganizationService(store)
    return service