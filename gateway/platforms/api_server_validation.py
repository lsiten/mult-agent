"""
Validation helpers for Gateway Dashboard API handlers.

Provides lightweight request validation without Pydantic dependency,
suitable for simple JSON schema validation in aiohttp handlers.
"""

from typing import Any, Dict, List, Optional
from aiohttp import web
import json


class ValidationError(Exception):
    """Validation error with HTTP status code."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def validate_json_body(body: bytes, schema: Dict[str, type]) -> Dict[str, Any]:
    """Validate JSON body against simple schema.

    Args:
        body: Raw request body bytes
        schema: Dict mapping field names to expected types
                Example: {"config": dict, "name": str}

    Returns:
        Parsed and validated data dictionary

    Raises:
        ValidationError: If JSON is malformed or types don't match

    Example:
        >>> body = b'{"config": {"model": "claude-4"}}'
        >>> validate_json_body(body, {"config": dict})
        {'config': {'model': 'claude-4'}}
    """
    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        raise ValidationError(f"Invalid JSON: {e}")

    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object")

    validated = {}
    for field, expected_type in schema.items():
        value = data.get(field)

        # Optional fields (None is allowed)
        if value is None:
            continue

        # Type checking
        if not isinstance(value, expected_type):
            raise ValidationError(
                f"Field '{field}' must be {expected_type.__name__}, "
                f"got {type(value).__name__}"
            )

        validated[field] = value

    return validated


def require_fields(data: Dict[str, Any], *fields: str) -> None:
    """Ensure required fields are present in data.

    Args:
        data: Dictionary to check
        *fields: Field names that must be present

    Raises:
        ValidationError: If any required field is missing

    Example:
        >>> data = {"name": "test"}
        >>> require_fields(data, "name", "email")  # Raises ValidationError
    """
    missing = [f for f in fields if f not in data or data[f] is None]
    if missing:
        raise ValidationError(
            f"Missing required fields: {', '.join(missing)}"
        )


async def parse_request_json(
    request: web.Request,
    schema: Dict[str, type],
    required: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Parse and validate request JSON in one call.

    Combines reading request body, validating against schema,
    and checking required fields.

    Args:
        request: aiohttp Request object
        schema: Dict mapping field names to expected types
        required: Optional list of required field names

    Returns:
        Validated data dictionary

    Raises:
        web.HTTPBadRequest: If validation fails

    Example:
        >>> data = await parse_request_json(
        ...     request,
        ...     {"config": dict},
        ...     required=["config"]
        ... )
    """
    try:
        body = await request.read()
        data = validate_json_body(body, schema)

        if required:
            require_fields(data, *required)

        return data

    except ValidationError as e:
        raise web.HTTPBadRequest(
            text=json.dumps({"error": e.message}),
            content_type="application/json"
        )
    except Exception as e:
        raise web.HTTPBadRequest(
            text=json.dumps({"error": f"Validation failed: {str(e)}"}),
            content_type="application/json"
        )
