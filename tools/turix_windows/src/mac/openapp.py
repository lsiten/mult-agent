import asyncio
import logging
import subprocess
from typing import Tuple

logger = logging.getLogger(__name__)


async def open_application_by_name(app_name: str) -> Tuple[bool, str]:
    """Open application on macOS using open command"""
    try:
        result = subprocess.run(
            ["open", "-a", app_name],
            capture_output=True,
            text=True,
            check=False
        )
        if result.returncode == 0:
            logger.info(f"Opened application: {app_name}")
            return True, f"Opened {app_name}"
        else:
            error_msg = result.stderr or "Unknown error"
            logger.error(f"Failed to open {app_name}: {error_msg}")
            return False, error_msg
    except Exception as e:
        logger.error(f"Error opening {app_name}: {e}")
        return False, str(e)
