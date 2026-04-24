"""
Common utilities for Skills API.

Shared context managers, exceptions, and constants.
"""

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, Any

logger = logging.getLogger(__name__)


@contextmanager
def with_skills_dir(skills_dir: Optional[Path]):
    """上下文管理器：临时替换 tools.skills_hub.SKILLS_DIR。

    Args:
        skills_dir: 目标 skills 目录（None 则不替换）

    Yields:
        None
    """
    import tools.skills_hub

    original = tools.skills_hub.SKILLS_DIR
    if skills_dir:
        tools.skills_hub.SKILLS_DIR = skills_dir
        # 确保目标目录和 .hub 子目录存在
        skills_dir.mkdir(parents=True, exist_ok=True)
        (skills_dir / ".hub").mkdir(parents=True, exist_ok=True)

    try:
        yield
    finally:
        if skills_dir:
            tools.skills_hub.SKILLS_DIR = original


class SecurityScanError(Exception):
    """Raised when security scan blocks skill installation."""

    def __init__(self, message: str, scan_result: Any, bundle_name: str):
        super().__init__(message)
        self.message = message
        self.scan_result = scan_result
        self.bundle_name = bundle_name
        self.details = {
            "verdict": scan_result.verdict,
            "threats_detected": len(scan_result.threats),
            "threats": scan_result.threats[:5],
            "can_force_install": True,
            "force_command": f"hermes skills install {bundle_name} --force"
        }


# Skill registry sources configuration
SKILL_REGISTRIES = {
    "skillssh": {
        "name": "Skills.sh Community",
        "repo": "skills-sh",
        "url_template": "https://skills.sh/api/search?q=",
        "website": "https://skills.sh/",
        "api_type": "search",  # Search API
    },
    "hermes": {
        "name": "Hermes Official",
        "repo": "hermes-official",
        "url_template": "https://hermes-agent.nousresearch.com/docs/api/skills-index.json",
        "website": "https://hermes-agent.nousresearch.com/docs/skills/",
        "api_type": "index",  # Static index
    },
}
REGISTRY_CACHE_TTL = 86400  # 24 hours
