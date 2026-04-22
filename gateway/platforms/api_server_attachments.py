"""
Attachments API handlers for file upload/download in unified chat.

Provides file upload with multipart form data, storage management,
and secure file serving.
"""

import logging
import uuid
from pathlib import Path

from aiohttp import web

from hermes_constants import get_hermes_home

_log = logging.getLogger(__name__)


class AttachmentsAPIHandlers:
    """Handlers for file attachment upload and download."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> None:
        """Validate session token. Raises 401 on failure.

        In Electron mode (HERMES_ELECTRON_MODE=true), auth is bypassed.
        """
        import os
        if os.getenv("HERMES_ELECTRON_MODE") == "1":
            return

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        if auth != expected:
            raise web.HTTPUnauthorized(text="Unauthorized")

    async def handle_upload_attachment(self, request: web.Request) -> web.Response:
        """POST /api/attachments/upload

        Upload a file attachment for a chat session.

        Expects multipart/form-data with:
            - file: the file to upload
            - session_id: the chat session ID

        Response:
            {
                "attachment_id": "abc123",
                "path": "data/attachments/chat_xxx/abc123.txt",
                "url": "/api/attachments/chat_xxx/abc123.txt",
                "name": "original.txt",
                "size": 1234,
                "mime_type": "text/plain"
            }
        """
        self._check_auth(request)

        try:
            # Parse multipart form data
            reader = await request.multipart()

            file_content = None
            file_filename = None
            file_content_type = None
            session_id = None

            async for field in reader:
                if field.name == "file":
                    # Read file content immediately
                    file_content = await field.read()
                    file_filename = field.filename or "file"
                    file_content_type = field.headers.get("Content-Type", "application/octet-stream")
                elif field.name == "session_id":
                    session_id = (await field.read()).decode("utf-8")

            if not file_content or not session_id:
                return web.json_response(
                    {"detail": "Missing file or session_id"},
                    status=400
                )

            # Validate session exists
            from hermes_state import SessionDB

            db = SessionDB()
            try:
                sid = db.resolve_session_id(session_id)
                if not sid:
                    return web.json_response({"detail": "Session not found"}, status=404)
            finally:
                db.close()

            # Create attachments directory
            attachments_dir = get_hermes_home() / "data" / "attachments" / session_id
            attachments_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique filename
            attachment_id = uuid.uuid4().hex[:12]
            file_ext = Path(file_filename).suffix
            safe_filename = f"{attachment_id}{file_ext}"
            file_path = attachments_dir / safe_filename

            # Save file
            file_path.write_bytes(file_content)

            # Get file info
            file_size = len(file_content)

            _log.info(
                "Uploaded attachment: session=%s, file=%s, size=%d",
                session_id, file_filename, file_size
            )

            return web.json_response({
                "attachment_id": attachment_id,
                "path": str(file_path.relative_to(get_hermes_home())),
                "url": f"/api/attachments/{session_id}/{safe_filename}",
                "name": file_filename,
                "size": file_size,
                "mime_type": file_content_type,
            })

        except Exception as e:
            _log.exception("POST /api/attachments/upload failed")
            return web.json_response({"detail": f"Upload failed: {str(e)}"}, status=500)

    async def handle_download_attachment(self, request: web.Request) -> web.Response:
        """GET /api/attachments/{session_id}/{filename}

        Download a previously uploaded attachment.

        Returns the file with appropriate Content-Type header.
        """
        try:
            session_id = request.match_info["session_id"]
            filename = request.match_info["filename"]

            attachments_dir = get_hermes_home() / "data" / "attachments" / session_id
            file_path = attachments_dir / filename

            # Security: prevent path traversal
            if not file_path.resolve().is_relative_to(attachments_dir.resolve()):
                return web.json_response({"detail": "Invalid file path"}, status=403)

            if not file_path.exists():
                return web.json_response({"detail": "File not found"}, status=404)

            # Determine content type
            import mimetypes
            content_type, _ = mimetypes.guess_type(str(file_path))
            if not content_type:
                content_type = "application/octet-stream"

            # Stream file
            return web.FileResponse(
                file_path,
                headers={"Content-Type": content_type}
            )

        except Exception as e:
            _log.exception("GET /api/attachments/{session_id}/{filename} failed")
            return web.json_response({"detail": str(e)}, status=500)
