import json
import logging

import pytest

from app.core.logging import log_event, request_id_var


def _last(caplog: pytest.LogCaptureFixture) -> dict:
    return json.loads(caplog.records[-1].getMessage())


def test_outputs_json_with_request_id(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="app")
    token = request_id_var.set("req_abc")
    try:
        log_event("draft_created", draft_id="d1", status_code=201, duration_ms=12)
    finally:
        request_id_var.reset(token)
    data = _last(caplog)
    assert data == {
        "event": "draft_created", "request_id": "req_abc", "draft_id": "d1",
        "status_code": 201, "duration_ms": 12,
    }  # fmt: skip


def test_request_id_defaults_to_none(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="app")
    log_event("startup")
    assert _last(caplog)["request_id"] is None


@pytest.mark.parametrize("field", ["name", "phone", "email", "filename", "token", "body"])
def test_non_whitelisted_field_rejected(field: str) -> None:
    with pytest.raises(ValueError, match="not allowed"):
        log_event("x", **{field: "ZZ-synthetic"})


def test_non_scalar_value_rejected() -> None:
    with pytest.raises(ValueError, match="scalar"):
        log_event("x", draft_id={"a": 1})  # type: ignore[arg-type]


def test_exception_logs_class_and_stack_not_message(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.ERROR, logger="app")
    try:
        raise RuntimeError("ZZ-secret-user-data")
    except RuntimeError as exc:
        log_event("boom", level="error", exc=exc)
    text = caplog.records[-1].getMessage()
    data = json.loads(text)
    assert data["exception_class"] == "RuntimeError"
    assert "test_logging.py" in data["stack"]
    assert "ZZ-secret-user-data" not in text
    assert caplog.records[-1].exc_info is None


def test_level_is_applied(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    log_event("w", level="warning", count=2)
    assert caplog.records[-1].levelno == logging.WARNING
    assert _last(caplog)["count"] == 2
