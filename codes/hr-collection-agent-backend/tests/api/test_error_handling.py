import json
import re

import pytest
from fastapi.testclient import TestClient

from app.core.errors import ErrorCode


def test_app_error_body_and_status(client: TestClient) -> None:
    r = client.get("/t/app-error")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "draft_not_found"
    assert body["message"] == "没有可恢复的草稿，请重新上传简历。"
    assert re.fullmatch(r"req_[0-9a-f]{16}", body["request_id"])
    assert "details" not in body


def test_validation_error_has_details(client: TestClient) -> None:
    r = client.get("/t/validation-error")
    assert r.status_code == 422
    assert r.json()["details"] == [{"field": "phone", "reason": "invalid_format"}]


def test_request_id_header_matches_body_and_is_unique(client: TestClient) -> None:
    a, b = client.get("/t/app-error"), client.get("/t/app-error")
    assert a.headers["x-request-id"] == a.json()["request_id"]
    assert a.json()["request_id"] != b.json()["request_id"]


def test_client_supplied_request_id_is_not_trusted(client: TestClient) -> None:
    r = client.get("/t/app-error", headers={"X-Request-ID": "evil\nid"})
    assert r.json()["request_id"] != "evil\nid"


def test_pydantic_validation_maps_to_validation_failed_without_input(
    client: TestClient,
) -> None:
    payload = {"fields": {"nick": "ZZ-secret", "name": "a" * 101, "skills": "ZZ-secret"}}
    r = client.patch("/t/model", json=payload)
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_failed"
    assert {(d["field"], d["reason"]) for d in body["details"]} == {
        ("nick", "unknown_field"), ("name", "too_long"), ("skills", "invalid_type"),
    }  # fmt: skip
    assert "ZZ-secret" not in r.text


def test_missing_fields_key(client: TestClient) -> None:
    r = client.patch("/t/model", json={})
    assert r.status_code == 422
    assert r.json()["details"] == [{"field": "fields", "reason": "required"}]


def test_invalid_json_body(client: TestClient) -> None:
    r = client.patch(
        "/t/model", content=b"{not json ZZ", headers={"content-type": "application/json"}
    )
    assert r.status_code == 422
    assert r.json()["code"] == "validation_failed"
    assert "ZZ" not in r.text


def test_confirmed_missing_is_confirmation_required(client: TestClient) -> None:
    for body in ({}, None):
        r = (
            client.post("/api/v1/resumes", json=body)
            if body is not None
            else client.post("/api/v1/resumes")
        )
        assert r.status_code == 422
        assert r.json()["code"] == "confirmation_required"
        assert "details" not in r.json()


def test_confirmed_wrong_type_stays_validation_failed(client: TestClient) -> None:
    r = client.post("/api/v1/resumes", json={"confirmed": "ZZ-yes-maybe"})
    assert r.json()["code"] == "validation_failed"
    assert "ZZ" not in r.text


def test_upload_without_file_is_file_missing(client: TestClient) -> None:
    assert client.post("/api/v1/resume-drafts").json()["code"] == "file_missing"
    r = client.post("/api/v1/resume-drafts", data={"other": "x"})
    assert r.status_code == 400 and r.json()["code"] == "file_missing"


def test_malformed_multipart_is_file_missing(client: TestClient) -> None:
    r = client.post(
        "/api/v1/resume-drafts",
        content=b"garbage",
        headers={"content-type": "multipart/form-data; boundary=xyz"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "file_missing"


def test_unhandled_exception_is_internal_error_without_details(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    r = client.get("/t/crash")
    assert r.status_code == 500
    body = r.json()
    assert body["code"] == ErrorCode.INTERNAL_ERROR.value
    assert body["message"] == "服务异常，请稍后重试。"
    assert re.fullmatch(r"req_[0-9a-f]{16}", body["request_id"])
    assert "ZZ-secret-user-data" not in r.text
    logs = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "RuntimeError" in logs
    assert "ZZ-secret-user-data" not in logs
    last = json.loads(caplog.records[-1].getMessage())
    assert last["request_id"] == body["request_id"]


def test_unknown_route_uses_unified_error_body(client: TestClient) -> None:
    r = client.get("/no/such/route")
    assert r.status_code == 404
    assert set(r.json()) == {"code", "message", "request_id"}


def test_error_logs_contain_no_request_content(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    client.patch("/t/model", json={"fields": {"name": "ZZ-secret" * 50}})
    logs = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "ZZ-secret" not in logs
    assert "validation_failed" in logs
