"""
Tests for API server validation helpers.
"""

import pytest
from aiohttp import web

from gateway.platforms.api_server_validation import (
    validate_json_body,
    require_fields,
    parse_request_json,
    ValidationError,
)


class TestValidateJsonBody:
    """Tests for validate_json_body function."""

    def test_valid_json_with_correct_types(self):
        body = b'{"name": "test", "count": 42, "enabled": true}'
        schema = {"name": str, "count": int, "enabled": bool}

        result = validate_json_body(body, schema)

        assert result == {"name": "test", "count": 42, "enabled": True}

    def test_invalid_json_raises_validation_error(self):
        body = b'{"name": invalid json}'
        schema = {"name": str}

        with pytest.raises(ValidationError) as exc_info:
            validate_json_body(body, schema)

        assert "Invalid JSON" in str(exc_info.value)

    def test_missing_optional_field_skipped(self):
        """Missing fields in schema are treated as optional and skipped."""
        body = b'{"name": "test"}'
        schema = {"name": str, "optional_field": int}

        result = validate_json_body(body, schema)

        assert result == {"name": "test"}

    def test_wrong_type_raises_validation_error(self):
        body = b'{"count": "not_a_number"}'
        schema = {"count": int}

        with pytest.raises(ValidationError) as exc_info:
            validate_json_body(body, schema)

        assert "must be int" in str(exc_info.value)

    def test_extra_fields_not_in_schema_ignored(self):
        """Fields not in schema are not validated or returned."""
        body = b'{"name": "test", "extra": "field"}'
        schema = {"name": str}

        result = validate_json_body(body, schema)

        assert result == {"name": "test"}
        assert "extra" not in result

    def test_nested_dict_validation(self):
        body = b'{"config": {"key": "value"}}'
        schema = {"config": dict}

        result = validate_json_body(body, schema)

        assert result == {"config": {"key": "value"}}

    def test_list_validation(self):
        body = b'{"items": [1, 2, 3]}'
        schema = {"items": list}

        result = validate_json_body(body, schema)

        assert result == {"items": [1, 2, 3]}

    def test_none_value_skipped(self):
        """None values are skipped (treated as not present)."""
        body = b'{"name": null}'
        schema = {"name": str}

        result = validate_json_body(body, schema)

        assert result == {}
        assert "name" not in result


class TestRequireFields:
    """Tests for require_fields function."""

    def test_all_fields_present(self):
        data = {"name": "test", "email": "test@example.com", "age": 30}

        # Should not raise
        require_fields(data, "name", "email")

    def test_missing_field_raises_validation_error(self):
        data = {"name": "test"}

        with pytest.raises(ValidationError) as exc_info:
            require_fields(data, "name", "email")

        assert "email" in str(exc_info.value)

    def test_no_required_fields(self):
        data = {"name": "test"}

        # Should not raise
        require_fields(data)

    def test_multiple_missing_fields(self):
        data = {}

        with pytest.raises(ValidationError) as exc_info:
            require_fields(data, "name", "email", "age")

        # Should report all missing fields
        error_msg = str(exc_info.value)
        assert "name" in error_msg
        assert "email" in error_msg
        assert "age" in error_msg


class TestParseRequestJson:
    """Tests for parse_request_json function."""

    @pytest.mark.asyncio
    async def test_valid_request_with_required_fields(self):
        # Mock request
        class MockRequest:
            async def read(self):
                return b'{"name": "test", "count": 42}'

        request = MockRequest()
        schema = {"name": str, "count": int}
        required = ["name", "count"]

        result = await parse_request_json(request, schema, required)

        assert result == {"name": "test", "count": 42}

    @pytest.mark.asyncio
    async def test_missing_required_field(self):
        class MockRequest:
            async def read(self):
                return b'{"name": "test"}'

        request = MockRequest()
        schema = {"name": str, "count": int}
        required = ["name", "count"]

        with pytest.raises(web.HTTPBadRequest) as exc_info:
            await parse_request_json(request, schema, required)

        assert "Missing required field" in str(exc_info.value.text)

    @pytest.mark.asyncio
    async def test_no_required_fields(self):
        class MockRequest:
            async def read(self):
                return b'{"name": "test"}'

        request = MockRequest()
        schema = {"name": str}

        result = await parse_request_json(request, schema, required=None)

        assert result == {"name": "test"}

    @pytest.mark.asyncio
    async def test_invalid_json(self):
        class MockRequest:
            async def read(self):
                return b'invalid json'

        request = MockRequest()
        schema = {"name": str}

        with pytest.raises(web.HTTPBadRequest):
            await parse_request_json(request, schema)

    @pytest.mark.asyncio
    async def test_empty_body(self):
        class MockRequest:
            async def read(self):
                return b'{}'

        request = MockRequest()
        schema = {}

        result = await parse_request_json(request, schema)

        assert result == {}
