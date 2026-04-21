"""
Cron jobs API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from aiohttp import web

logger = logging.getLogger(__name__)


class CronAPIHandlers:
    """Cron jobs management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "true":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_list_jobs(self, request: web.Request) -> web.Response:
        """GET /api/cron/jobs - List all cron jobs."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from cron.jobs import list_jobs
            jobs = list_jobs(include_disabled=True)
            return web.json_response(jobs)

        except Exception as e:
            logger.error(f"Failed to list cron jobs: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_job(self, request: web.Request) -> web.Response:
        """GET /api/cron/jobs/{job_id} - Get specific cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            job_id = request.match_info["job_id"]

            from cron.jobs import get_job
            job = get_job(job_id)

            if not job:
                return web.json_response(
                    {"error": "Job not found"},
                    status=404
                )

            return web.json_response(job)

        except Exception as e:
            logger.error(f"Failed to get cron job: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_create_job(self, request: web.Request) -> web.Response:
        """POST /api/cron/jobs - Create new cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(
                request,
                {"prompt": str, "schedule": str, "name": str, "deliver": str},
                required=["prompt", "schedule"]
            )

            from cron.jobs import create_job
            job = create_job(
                prompt=data["prompt"],
                schedule=data["schedule"],
                name=data.get("name"),
                deliver=data.get("deliver")
            )

            return web.json_response(job)

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to create cron job: {e}")
            return web.json_response({"error": str(e)}, status=400)

    async def handle_update_job(self, request: web.Request) -> web.Response:
        """PUT /api/cron/jobs/{job_id} - Update cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            job_id = request.match_info["job_id"]

            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(request, {"updates": dict}, required=["updates"])

            from cron.jobs import update_job
            job = update_job(job_id, data["updates"])

            if not job:
                return web.json_response(
                    {"error": "Job not found"},
                    status=404
                )

            return web.json_response(job)

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to update cron job: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_pause_job(self, request: web.Request) -> web.Response:
        """POST /api/cron/jobs/{job_id}/pause - Pause cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            job_id = request.match_info["job_id"]

            from cron.jobs import pause_job
            job = pause_job(job_id)

            if not job:
                return web.json_response(
                    {"error": "Job not found"},
                    status=404
                )

            return web.json_response(job)

        except Exception as e:
            logger.error(f"Failed to pause cron job: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_resume_job(self, request: web.Request) -> web.Response:
        """POST /api/cron/jobs/{job_id}/resume - Resume cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            job_id = request.match_info["job_id"]

            from cron.jobs import resume_job
            job = resume_job(job_id)

            if not job:
                return web.json_response(
                    {"error": "Job not found"},
                    status=404
                )

            return web.json_response(job)

        except Exception as e:
            logger.error(f"Failed to resume cron job: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_trigger_job(self, request: web.Request) -> web.Response:
        """POST /api/cron/jobs/{job_id}/trigger - Manually trigger cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            job_id = request.match_info["job_id"]

            from cron.jobs import trigger_job
            job = trigger_job(job_id)

            if not job:
                return web.json_response(
                    {"error": "Job not found"},
                    status=404
                )

            return web.json_response(job)

        except Exception as e:
            logger.error(f"Failed to trigger cron job: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_job(self, request: web.Request) -> web.Response:
        """DELETE /api/cron/jobs/{job_id} - Delete cron job."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            job_id = request.match_info["job_id"]

            from cron.jobs import remove_job
            success = remove_job(job_id)

            if not success:
                return web.json_response(
                    {"error": "Job not found"},
                    status=404
                )

            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to delete cron job: {e}")
            return web.json_response({"error": str(e)}, status=500)
