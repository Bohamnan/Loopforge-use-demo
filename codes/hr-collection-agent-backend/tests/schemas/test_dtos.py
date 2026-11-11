import pytest
from pydantic import ValidationError

from app.core.errors import ErrorCode, IssueReason
from app.schemas import limits as L
from app.schemas.archive import ResumeValues
from app.schemas.chat import ChatMessage, SendMessageRequest, Suggestion
from app.schemas.errors import ErrorDetail, ErrorResponse
from app.schemas.file_info import OriginalFileInfo
from app.schemas.parse import RawParseResult
from app.schemas.resume import (
    CreateResumeRequest,
    CreateResumeResponse,
    UpdateResumeRequest,
    UpdateResumeResponse,
)
from app.schemas.session import SessionDetail, SessionFieldsUpdateRequest
from tests.schemas.test_resume_fields import FIELD_KEYS, LIST_KEYS, _all_fields

UUID = "3f2b8c1e-5d4a-4e0b-9a77-0c1d2e3f4a5b"
TS = "2026-11-10T08:00:00Z"
FILE = {"filename": "a.pdf", "content_type": "application/pdf", "size_bytes": 10}


def values() -> dict:
    return {k: ([] if k in LIST_KEYS or k.endswith(("experiences", "educations")) else None)
            for k in FIELD_KEYS}  # fmt: skip


def message(role: str = "user", suggestions: list | None = None) -> dict:
    return {"message_id": UUID, "role": role, "content": "hi",
            "suggestions": suggestions or [], "created_at": TS}  # fmt: skip


def session_detail() -> SessionDetail:
    return SessionDetail.model_validate({
        "session_id": UUID, "name": "n", "status": "reviewing", "update_state": "none",
        "original_file": FILE, "fields": _all_fields(), "resume": None,
        "update_candidate": None, "messages": [message()],
        "created_at": TS, "updated_at": TS, "last_active_at": TS,
    })  # fmt: skip


def test_session_detail_has_no_expires_at_and_keeps_nullable_shapes() -> None:
    d = session_detail().model_dump(mode="json")
    assert "expires_at" not in d and "draft_id" not in d
    assert d["resume"] is None and d["update_candidate"] is None
    assert d["messages"][0]["role"] == "user"


@pytest.mark.parametrize("bad", [0, 10485761])
def test_original_file_size_bounds(bad: int) -> None:
    with pytest.raises(ValidationError):
        OriginalFileInfo(filename="a.pdf", content_type="application/pdf", size_bytes=bad)
    OriginalFileInfo(filename="a.pdf", content_type="image/png", size_bytes=10485760)


def test_session_fields_update_request_requires_fields_and_forbids_extra() -> None:
    with pytest.raises(ValidationError):
        SessionFieldsUpdateRequest.model_validate({})
    with pytest.raises(ValidationError):
        SessionFieldsUpdateRequest.model_validate({"fields": {}, "x": 1})
    assert SessionFieldsUpdateRequest.model_validate({"fields": {"skills": []}}).fields.skills == []


@pytest.mark.parametrize(
    ("content", "ok"),
    [("x", True), ("a" * L.MESSAGE_MAX, True), ("a" * (L.MESSAGE_MAX + 1), False), ("", False)],
)
def test_send_message_content_bounds(content: str, ok: bool) -> None:
    if ok:
        assert SendMessageRequest(content=content).content == content
    else:
        with pytest.raises(ValidationError):
            SendMessageRequest(content=content)
    with pytest.raises(ValidationError):
        SendMessageRequest.model_validate({"content": "x", "y": 1})


def test_suggestion_and_message_dump_shape() -> None:
    s = Suggestion(suggestion_id=UUID, field="skills", old_value=["a"], new_value=["a", "b"],
                   applicable=True, reason=None, status="pending")  # fmt: skip
    m = ChatMessage.model_validate(message("assistant", [s.model_dump()]))
    assert m.suggestions[0].new_value == ["a", "b"]
    with pytest.raises(ValidationError):
        Suggestion(suggestion_id=UUID, field="x", old_value=None, new_value=None,
                   applicable=False, reason="nope", status="pending")  # type: ignore[arg-type]  # fmt: skip


def test_suggestion_whitelist_excludes_experience_blocks() -> None:
    assert len(L.SUGGESTION_FIELDS) == 19
    assert not {"work_experiences", "project_experiences", "educations"} & set(L.SUGGESTION_FIELDS)


def test_resume_values_requires_all_22_keys_and_has_no_status() -> None:
    assert list(ResumeValues.model_validate(values()).model_dump()) == FIELD_KEYS
    data = values()
    del data["email"]
    with pytest.raises(ValidationError):
        ResumeValues.model_validate(data)


def test_confirm_requests_require_literal_bool() -> None:
    assert CreateResumeRequest.model_validate({"confirmed": True}).confirmed is True
    assert UpdateResumeRequest.model_validate({"confirm_update": True}).confirm_update is True
    for model, key in ((CreateResumeRequest, "confirmed"), (UpdateResumeRequest, "confirm_update")):
        with pytest.raises(ValidationError):
            model.model_validate({})
        with pytest.raises(ValidationError):
            model.model_validate({key: "true"})
        with pytest.raises(ValidationError):
            model.model_validate({key: True, "x": 1})


def test_response_dumps() -> None:
    assert CreateResumeResponse(resume_id=UUID, already_saved=False, saved_at=TS).model_dump() == {
        "resume_id": UUID, "already_saved": False, "saved_at": TS,
    }  # fmt: skip
    assert UpdateResumeResponse(resume_id=UUID, updated_at=TS).model_dump() == {
        "resume_id": UUID, "updated_at": TS,
    }  # fmt: skip


def test_error_response_details_optional() -> None:
    e = ErrorResponse(code=ErrorCode.INTERNAL_ERROR, message="m", request_id="r")
    assert e.model_dump(mode="json", exclude_none=True) == {
        "code": "internal_error", "message": "m", "request_id": "r",
    }  # fmt: skip
    detail = ErrorDetail(field="content", reason=IssueReason.TOO_LONG)
    e = ErrorResponse(
        code=ErrorCode.VALIDATION_FAILED, message="m", request_id="r", details=[detail]
    )
    assert e.model_dump(mode="json")["details"] == [{"field": "content", "reason": "too_long"}]


def test_raw_parse_result_wraps_untrusted_dict() -> None:
    r = RawParseResult(data={"name": {"value": "x", "status": "recognized"}}, prompt_tokens=1)
    assert r.data["name"]["value"] == "x" and r.prompt_tokens == 1
