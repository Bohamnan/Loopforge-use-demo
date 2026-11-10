import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from tests.api.conftest import draft_rows
from tests.fakes import FakeClock
from tests.helpers import make_pdf_bytes
from tests.openapi_support import openapi_available, schema_errors

URL = "/api/v1/resume-drafts"
CURRENT = f"{URL}/current"
SENTINEL = "ZZSENTINEL"

ARABIC_INDIC = "".join(chr(0x0661 + i % 9) for i in range(10))
FULLWIDTH = "１３８００１３８０００"


def upload(client: TestClient):  # noqa: ANN201
    return client.post(URL, files={"file": ("resume.pdf", make_pdf_bytes(300), "application/pdf")})


def patch(client: TestClient, fields: object):  # noqa: ANN201
    return client.patch(CURRENT, json={"fields": fields})


def attrs(header: str) -> set[str]:
    return {p.strip() for p in header.split(";")}


def stored(settings: Settings) -> dict:
    return json.loads(draft_rows(settings)[0]["fields_json"])


# ---- success ----


def test_patch_confirms_submitted_fields_and_keeps_the_rest(
    draft_client: TestClient, settings: Settings, fake_clock: FakeClock
) -> None:
    created = upload(draft_client).json()
    fake_clock.advance(hours=1)
    resp = patch(
        draft_client, {"name": "ZHANG SAN", "phone": "13900139000", "skills": ["Python", "Go"]}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["fields"]["name"] == {"value": "ZHANG SAN", "status": "confirmed"}
    assert body["fields"]["phone"] == {"value": "13900139000", "status": "confirmed"}
    assert body["fields"]["skills"] == {"value": ["Python", "Go"], "status": "confirmed"}
    for key in ("email", "job_title", "current_city", "educations", "gender"):
        assert body["fields"][key] == created["fields"][key]  # untouched
    assert (
        body["created_at"] == created["created_at"] and body["updated_at"] == "2026-11-10T09:00:00Z"
    )
    assert body["expires_at"] == "2026-11-17T09:00:00Z"
    after = stored(settings)  # data-level assertion
    assert after["phone"] == {"value": "13900139000", "status": "confirmed"}
    assert after["email"]["status"] == "recognized"


def test_patch_renews_the_cookie_with_identical_attributes(draft_client: TestClient) -> None:
    upload(draft_client)
    token = draft_client.cookies.get("draft_token")
    header = patch(draft_client, {"skills": ["Go"]}).headers["set-cookie"]
    assert header.startswith(f"draft_token={token};")
    assert {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=604800"} <= attrs(header)


def test_null_and_empty_list_confirm_empty(draft_client: TestClient) -> None:
    upload(draft_client)
    body = patch(draft_client, {"job_title": None, "skills": [], "educations": []}).json()
    assert body["fields"]["job_title"] == {"value": None, "status": "confirmed"}
    assert body["fields"]["skills"] == {"value": [], "status": "confirmed"}
    assert body["fields"]["educations"] == {"value": [], "status": "confirmed"}


def test_block_is_replaced_as_a_whole(draft_client: TestClient, settings: Settings) -> None:
    upload(draft_client)
    entries = [{"school": "A", "start_date": "2010"}, {"school": "B"}]
    body = patch(draft_client, {"educations": entries}).json()
    assert [e["school"] for e in body["fields"]["educations"]["value"]] == ["A", "B"]
    assert body["fields"]["educations"]["value"][1]["major"] is None
    again = patch(draft_client, {"educations": [{"school": "C"}]}).json()
    assert [e["school"] for e in again["fields"]["educations"]["value"]] == ["C"]
    assert [e["school"] for e in stored(settings)["educations"]["value"]] == ["C"]


@pytest.mark.parametrize(
    "phone",
    [
        "13800138000",
        "138 0013 8000",
        "138-0013-8000",
        " 138 - 0013 - 8000 ",
        "+85212345678",
        "+852 1234 5678",
    ],
)
def test_phone_rule_applies_to_the_value_without_spaces_and_hyphens(
    draft_client: TestClient, phone: str
) -> None:
    upload(draft_client)
    assert patch(draft_client, {"phone": phone}).status_code == 200


def test_patch_is_idempotent_and_get_returns_the_same_draft(draft_client: TestClient) -> None:
    upload(draft_client)
    a = patch(draft_client, {"skills": ["Go"], "job_title": "X"}).json()
    b = patch(draft_client, {"skills": ["Go"], "job_title": "X"}).json()
    assert a["fields"] == b["fields"]
    assert draft_client.get(CURRENT).json()["fields"] == b["fields"]


def test_unconfirmed_fields_keep_their_model_statuses(draft_client: TestClient) -> None:
    upload(draft_client)
    body = patch(draft_client, {"name": "ZHANG SAN"}).json()
    assert body["fields"]["current_city"]["status"] == "uncertain"
    assert body["fields"]["gender"]["status"] == "missing"


@pytest.mark.skipif(not openapi_available(), reason="frozen openapi.yaml not found")
def test_responses_conform_to_openapi(draft_client: TestClient) -> None:
    upload(draft_client)
    assert schema_errors("DraftResponse", patch(draft_client, {"skills": ["Go"]}).json()) == []
    assert schema_errors("ErrorResponse", patch(draft_client, {"phone": "abc"}).json()) == []


# ---- 404 ----


def test_no_cookie_is_404(draft_client: TestClient) -> None:
    resp = patch(draft_client, {"skills": ["Go"]})
    assert resp.status_code == 404 and resp.json()["code"] == "draft_not_found"
    assert "set-cookie" not in resp.headers


def test_unknown_cookie_is_404(draft_client: TestClient) -> None:
    upload(draft_client)
    draft_client.cookies.set("draft_token", "wrong")
    assert patch(draft_client, {"skills": ["Go"]}).status_code == 404


def test_expired_draft_is_404_and_unchanged(
    draft_client: TestClient, settings: Settings, fake_clock: FakeClock
) -> None:
    upload(draft_client)
    fake_clock.advance(days=7, seconds=1)
    resp = patch(draft_client, {"skills": ["Go"]})
    assert resp.status_code == 404 and resp.json()["code"] == "draft_not_found"
    assert stored(settings)["skills"]["status"] == "recognized"


# ---- 422: validate_update / validate_core_fields at the interface (D-06, B-03) ----

BAD_PAYLOADS = [
    # phone: formats, Unicode digits (ASCII only), rule applied after removing spaces/hyphens
    ({"phone": "abc"}, {("phone", "invalid_format")}),
    ({"phone": "12345"}, {("phone", "invalid_format")}),
    ({"phone": "+123"}, {("phone", "invalid_format")}),
    ({"phone": "23800138000"}, {("phone", "invalid_format")}),
    ({"phone": "138 0013 800"}, {("phone", "invalid_format")}),  # too short once spaces are removed
    ({"phone": "1380013800a"}, {("phone", "invalid_format")}),
    ({"phone": "1" + ARABIC_INDIC}, {("phone", "invalid_format")}),
    ({"phone": FULLWIDTH}, {("phone", "invalid_format")}),
    ({"phone": "+" + FULLWIDTH[:8]}, {("phone", "invalid_format")}),
    ({"phone": "+٨٦١٣٨٠٠١٣٨٠٠٠"}, {("phone", "invalid_format")}),
    ({"phone": "1" + ARABIC_INDIC[:5] + " " + ARABIC_INDIC[5:]}, {("phone", "invalid_format")}),
    ({"phone": ""}, {("phone", "required")}),
    ({"phone": "   "}, {("phone", "required")}),
    ({"phone": "1" * 33}, {("phone", "too_long")}),
    # email
    ({"email": "zz"}, {("email", "invalid_format")}),
    ({"email": "zz@"}, {("email", "invalid_format")}),
    ({"email": "@example.com"}, {("email", "invalid_format")}),
    ({"email": "a b@example.com"}, {("email", "invalid_format")}),
    ({"email": ""}, {("email", "required")}),
    ({"email": " "}, {("email", "required")}),
    ({"email": "a" * 250 + "@e.cc"}, {("email", "too_long")}),
    # name
    ({"name": ""}, {("name", "required")}),
    ({"name": "  "}, {("name", "required")}),
    ({"name": "n" * 101}, {("name", "too_long")}),
    # lengths and counts (CR-01)
    ({"job_title": "x" * 501}, {("job_title", "too_long")}),
    ({"self_evaluation": "x" * 5001}, {("self_evaluation", "too_long")}),
    ({"skills": ["s"] * 51}, {("skills", "too_long")}),
    ({"skills": ["s" * 1001]}, {("skills[0]", "too_long")}),
    ({"work_experiences": [{}] * 21}, {("work_experiences", "too_long")}),
    ({"educations": [{"school": "s" * 2001}]}, {("educations[0].school", "too_long")}),
    (
        {"work_experiences": [{"responsibilities": ["r"] * 31}]},
        {("work_experiences[0].responsibilities", "too_long")},
    ),
    # unknown keys and wrong types
    ({"nickname": "x"}, {("nickname", "unknown_field")}),
    ({"skills": "Python"}, {("skills", "invalid_type")}),
    ({"name": None}, {("name", "invalid_type")}),
    ({"phone": 13800138000}, {("phone", "invalid_type")}),
    ({"educations": [{"school": 5}]}, {("educations[0].school", "invalid_type")}),
    ({"educations": [{"nope": "x"}]}, {("educations[0].nope", "unknown_field")}),
    # several problems are all reported in one response
    (
        {"phone": "12", "email": "x", "name": "", "nickname": "y"},
        {
            ("phone", "invalid_format"),
            ("email", "invalid_format"),
            ("name", "required"),
            ("nickname", "unknown_field"),
        },
    ),
]


@pytest.mark.parametrize(("payload", "expected"), BAD_PAYLOADS)
def test_invalid_updates_return_422_with_field_and_reason_only(
    draft_client: TestClient, settings: Settings, payload: dict, expected: set
) -> None:
    upload(draft_client)
    before = draft_rows(settings)[0]["fields_json"], draft_rows(settings)[0]["updated_at"]
    resp = patch(draft_client, {"skills": ["VALID-BUT-NOT-SAVED"], **payload})
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "validation_failed" and set(body) == {
        "code",
        "message",
        "request_id",
        "details",
    }
    assert {(d["field"], d["reason"]) for d in body["details"]} >= expected
    assert all(set(d) == {"field", "reason"} for d in body["details"])
    assert "set-cookie" not in resp.headers
    after = draft_rows(settings)[0]
    assert (after["fields_json"], after["updated_at"]) == before  # nothing written (all-or-nothing)


@pytest.mark.parametrize(
    "key", ["name", "phone", "email", "job_title", "skills", "self_evaluation"]
)
def test_error_bodies_never_echo_submitted_values(draft_client: TestClient, key: str) -> None:
    upload(draft_client)
    value: object = [SENTINEL * 400] if key == "skills" else SENTINEL * 700
    resp = patch(draft_client, {key: value, "nickname": SENTINEL})
    assert resp.status_code == 422 and SENTINEL not in resp.text


def test_sentinel_values_in_core_fields_are_not_echoed(draft_client: TestClient) -> None:
    upload(draft_client)
    resp = patch(draft_client, {"phone": SENTINEL, "email": SENTINEL, "name": " "})
    assert resp.status_code == 422 and SENTINEL not in resp.text
    assert {(d["field"], d["reason"]) for d in resp.json()["details"]} == {
        ("phone", "invalid_format"), ("email", "invalid_format"), ("name", "required"),
    }  # fmt: skip


@pytest.mark.parametrize(
    "body",
    [{}, {"fields": {}}, {"fields": {"skills": []}, "extra": 1}, [], "text", {"fields": []}],
)
def test_malformed_bodies_return_422(
    draft_client: TestClient, settings: Settings, body: object
) -> None:
    upload(draft_client)
    resp = draft_client.patch(CURRENT, json=body)
    assert resp.status_code == 422
    assert resp.json()["code"] == "validation_failed"
    assert stored(settings)["skills"]["status"] == "recognized"


def test_empty_fields_object_reports_fields_required(draft_client: TestClient) -> None:
    upload(draft_client)
    resp = patch(draft_client, {})
    assert resp.status_code == 422
    assert resp.json()["details"] == [{"field": "fields", "reason": "required"}]


def test_invalid_json_returns_422_without_echo(draft_client: TestClient) -> None:
    upload(draft_client)
    resp = draft_client.patch(
        CURRENT,
        content=f"{{not json {SENTINEL}".encode(),
        headers={"content-type": "application/json"},
    )
    assert (
        resp.status_code == 422
        and resp.json()["code"] == "validation_failed"
        and SENTINEL not in resp.text
    )


def test_body_validation_happens_before_the_cookie_check(draft_client: TestClient) -> None:
    assert patch(draft_client, {"phone": "abc"}).status_code == 422  # no cookie, bad body


def test_patch_does_not_log_submitted_values(
    draft_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    upload(draft_client)
    patch(draft_client, {"job_title": SENTINEL, "phone": SENTINEL})
    patch(draft_client, {"job_title": SENTINEL})
    token = draft_client.cookies.get("draft_token")
    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert SENTINEL not in logs and token not in logs
