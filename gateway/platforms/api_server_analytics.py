"""
Analytics API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from datetime import datetime, timedelta
from aiohttp import web

logger = logging.getLogger(__name__)


class AnalyticsAPIHandlers:
    """Analytics API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "true":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_usage(self, request: web.Request) -> web.Response:
        """GET /api/analytics/usage - Get usage statistics."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            days = int(request.query.get("days", "7"))

            from hermes_state import SessionDB
            db = SessionDB()

            # Calculate date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get sessions in date range
            sessions = db.list_sessions_rich(limit=1000, offset=0)

            # Filter by date and aggregate stats
            by_date = {}
            by_model = {}
            totals = {
                "total_input": 0,
                "total_output": 0,
                "total_cache_read": 0,
                "total_reasoning": 0,
                "total_estimated_cost": 0.0,
                "total_actual_cost": 0.0,
                "total_sessions": 0,
            }

            for session in sessions:
                started_at = session.get("started_at", 0)
                if started_at:
                    try:
                        session_date = datetime.fromtimestamp(started_at)
                        if start_date <= session_date <= end_date:
                            # Update totals
                            totals["total_sessions"] += 1
                            totals["total_input"] += session.get("input_tokens", 0)
                            totals["total_output"] += session.get("output_tokens", 0)
                            totals["total_cache_read"] += session.get("cache_read_tokens", 0)
                            totals["total_reasoning"] += session.get("reasoning_tokens", 0)
                            totals["total_estimated_cost"] += session.get("estimated_cost_usd", 0) or 0
                            totals["total_actual_cost"] += session.get("actual_cost_usd", 0) or 0

                            # Group by date
                            date_key = session_date.strftime("%Y-%m-%d")
                            if date_key not in by_date:
                                by_date[date_key] = {
                                    "day": date_key,
                                    "input_tokens": 0,
                                    "output_tokens": 0,
                                    "cache_read_tokens": 0,
                                    "reasoning_tokens": 0,
                                    "estimated_cost": 0.0,
                                    "actual_cost": 0.0,
                                    "sessions": 0,
                                }
                            by_date[date_key]["sessions"] += 1
                            by_date[date_key]["input_tokens"] += session.get("input_tokens", 0)
                            by_date[date_key]["output_tokens"] += session.get("output_tokens", 0)
                            by_date[date_key]["cache_read_tokens"] += session.get("cache_read_tokens", 0)
                            by_date[date_key]["reasoning_tokens"] += session.get("reasoning_tokens", 0)
                            by_date[date_key]["estimated_cost"] += session.get("estimated_cost_usd", 0) or 0
                            by_date[date_key]["actual_cost"] += session.get("actual_cost_usd", 0) or 0

                            # Group by model
                            model = session.get("model") or "unknown"
                            if model not in by_model:
                                by_model[model] = {
                                    "model": model,
                                    "input_tokens": 0,
                                    "output_tokens": 0,
                                    "estimated_cost": 0.0,
                                    "sessions": 0,
                                }
                            by_model[model]["sessions"] += 1
                            by_model[model]["input_tokens"] += session.get("input_tokens", 0)
                            by_model[model]["output_tokens"] += session.get("output_tokens", 0)
                            by_model[model]["estimated_cost"] += session.get("estimated_cost_usd", 0) or 0
                    except Exception:
                        pass

            # Convert to arrays and sort
            daily = sorted(by_date.values(), key=lambda x: x["day"])
            models = sorted(by_model.values(), key=lambda x: x["sessions"], reverse=True)

            response = {
                "daily": daily,
                "by_model": models,
                "totals": totals,
            }

            return web.json_response(response)

        except ValueError:
            return web.json_response(
                {"error": "Invalid 'days' parameter"},
                status=400
            )
        except Exception as e:
            logger.error(f"Failed to get analytics: {e}")
            return web.json_response({"error": str(e)}, status=500)
