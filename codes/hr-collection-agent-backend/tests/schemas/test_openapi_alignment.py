"""Schemas must stay aligned with the frozen OpenAPI 0.2.0."""

from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from app.schemas import limits as L
from app.schemas.archive import ResumeListResponse, ResumeSummary, ResumeValues
from app.schemas.chat import ChatMessage, SendMessageResponse, Suggestion
from app.schemas.resume import UpdateResumeResponse
from app.schemas.resume_fields import ResumeFields, ResumeFieldsUpdate
from app.schemas.session import SessionListResponse, SessionSummary
from tests.schemas.test_dtos import FILE, TS, UUID, message, session_detail, values

OPENAPI = Path(__file__).resolve().parents[4] / "backend-docs/HR_PR-1/03_api/openapi.yaml"
pytestmark = pytest.mark.skipif(not OPENAPI.exists(), reason="frozen openapi.yaml not found")


@pytest.fixture(scope="module")
def spec() -> dict:
    return yaml.safe_load(OPENAPI.read_text())


def errors_of(spec: dict, name: str, payload: dict) -> list:
    v = Draft202012Validator(
        {"$ref": f"#/components/schemas/{name}", "components": spec["components"]}
    )
    return list(v.iter_errors(payload))


def test_version(spec: dict) -> None:
    assert spec["info"]["version"] == "0.2.0"


def test_dtos_serialise_to_schema_conformant_json(spec: dict) -> None:
    sug = Suggestion(suggestion_id=UUID, field="phone", old_value=None, new_value="13800138000",
                     applicable=False, reason="invalid_format", status="pending")  # fmt: skip
    msg = ChatMessage.model_validate(message("assistant", [sug.model_dump()]))
    cases = {
        "SessionDetail": session_detail(),
        "SessionSummary": SessionSummary(
            session_id=UUID, name="n", status="saved", last_active_at=TS
        ),
        "SessionListResponse": SessionListResponse(items=[]),
        "ChatMessage": msg,
        "SendMessageResponse": SendMessageResponse(user_message=msg, assistant_message=msg),
        "ResumeValues": ResumeValues.model_validate(values()),
        "ResumeSummary": ResumeSummary(
            resume_id=UUID, name="n", phone="p", email="e", job_title=None, saved_at=TS
        ),  # fmt: skip
        "ResumeListResponse": ResumeListResponse(items=[]),
        "UpdateResumeResponse": UpdateResumeResponse(resume_id=UUID, updated_at=TS),
    }
    for name, dto in cases.items():
        assert errors_of(spec, name, dto.model_dump(mode="json")) == [], name
    assert FILE["filename"] == "a.pdf"


def test_field_names_match(spec: dict) -> None:
    s = spec["components"]["schemas"]
    assert list(ResumeFields.model_fields) == list(s["ResumeFields"]["properties"])
    assert list(ResumeFieldsUpdate.model_fields) == list(s["ResumeFieldsUpdate"]["properties"])
    assert list(ResumeValues.model_fields) == list(s["ResumeValues"]["properties"])


def test_suggestion_whitelist_matches_openapi(spec: dict) -> None:
    assert list(L.SUGGESTION_FIELDS) == spec["components"]["schemas"]["SuggestionField"]["enum"]


def test_limits_match_openapi(spec: dict) -> None:
    s = spec["components"]["schemas"]
    p = s["ResumeFieldsUpdate"]["properties"]
    assert p["name"]["maxLength"] == L.NAME_MAX
    assert p["phone"]["maxLength"] == L.PHONE_MAX
    assert p["email"]["maxLength"] == L.EMAIL_MAX
    assert p["job_title"]["maxLength"] == L.SCALAR_MAX
    assert p["self_evaluation"]["maxLength"] == L.SELF_EVALUATION_MAX
    assert p["skills"]["maxItems"] == L.TEXT_LIST_MAX_ITEMS
    assert p["skills"]["items"]["maxLength"] == L.TEXT_LIST_ITEM_MAX
    assert p["work_experiences"]["maxItems"] == L.BLOCK_MAX_ENTRIES
    assert s["WorkExperience"]["properties"]["company"]["maxLength"] == L.ENTRY_STRING_MAX
    assert s["SendMessageRequest"]["properties"]["content"]["maxLength"] == L.MESSAGE_MAX
    assert p["phone"]["pattern"] == L.PHONE_PATTERN
    assert p["email"]["pattern"] == L.EMAIL_PATTERN
