"""
Speech-to-Text (STT) API handlers for voice input.

Provides audio transcription using OpenAI Whisper API or other STT providers.
"""

import logging
import os
import tempfile
import uuid
from pathlib import Path

from aiohttp import web

_log = logging.getLogger(__name__)


class STTAPIHandlers:
    """Handlers for speech-to-text transcription."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> None:
        """Validate session token. Raises 401 on failure.

        In Electron mode (HERMES_ELECTRON_MODE=true), auth is bypassed.
        """
        if os.getenv("HERMES_ELECTRON_MODE") == "true":
            return

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        if auth != expected:
            raise web.HTTPUnauthorized(text="Unauthorized")

    async def handle_transcribe_audio(self, request: web.Request) -> web.Response:
        """POST /api/stt/transcribe

        Transcribe audio to text using OpenAI Whisper API.

        Expects multipart/form-data with:
            - audio: the audio file (webm, wav, mp3, m4a)

        Response:
            {
                "text": "转录的文本内容",
                "provider": "openai-whisper"
            }
        """
        self._check_auth(request)

        temp_file = None
        try:
            # Parse multipart form data
            reader = await request.multipart()

            audio_field = None
            async for field in reader:
                if field.name == "audio":
                    audio_field = field
                    break

            if not audio_field:
                return web.json_response({"detail": "Missing audio file"}, status=400)

            # Save to temporary file
            temp_dir = Path(tempfile.gettempdir()) / "hermes-stt"
            temp_dir.mkdir(exist_ok=True)

            # Determine file extension
            content_type = audio_field.headers.get("Content-Type", "audio/webm")
            ext_map = {
                "audio/webm": ".webm",
                "audio/wav": ".wav",
                "audio/mp3": ".mp3",
                "audio/mp4": ".m4a",
                "audio/mpeg": ".mp3",
            }
            ext = ext_map.get(content_type, ".webm")

            temp_file = temp_dir / f"recording_{uuid.uuid4().hex[:8]}{ext}"
            content = await audio_field.read()
            temp_file.write_bytes(content)

            _log.info("STT: Received audio file, size=%d bytes, format=%s", len(content), ext)

            # Try to use OpenAI Whisper API
            try:
                import openai

                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY not configured")

                client = openai.OpenAI(api_key=api_key)

                with open(temp_file, "rb") as f:
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=f,
                        language="zh"  # Can be made configurable
                    )

                text = transcript.text
                _log.info("STT: Transcribed successfully, length=%d", len(text))

                # Clean up temp file
                try:
                    temp_file.unlink()
                except:
                    pass

                return web.json_response({
                    "text": text,
                    "provider": "openai-whisper"
                })

            except Exception as whisper_err:
                _log.warning("OpenAI Whisper failed: %s", whisper_err)

                # Clean up temp file
                try:
                    if temp_file:
                        temp_file.unlink()
                except:
                    pass

                return web.json_response(
                    {"detail": f"STT service unavailable: {str(whisper_err)}"},
                    status=503
                )

        except Exception as e:
            _log.exception("POST /api/stt/transcribe failed")

            # Clean up temp file
            try:
                if temp_file:
                    temp_file.unlink()
            except:
                pass

            return web.json_response(
                {"detail": f"Transcription failed: {str(e)}"},
                status=500
            )
