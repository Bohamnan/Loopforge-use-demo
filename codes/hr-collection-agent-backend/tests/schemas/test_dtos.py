import pytest
from pydantic import ValidationError

from app.core.errors import ErrorCode, IssueReason
from app.schemas.draft import DraftResponse, DraftUpdateRequest, OriginalFileInfo
from app.schemas.errors import ErrorDetail, ErrorResponse
from app.schemas.parse import RawParseResult
from app.schemas.resume import CreateResumeRequest, CreateResumeResponse
from tests.schemas.test_resume_fields import _all_fields


def _draft() -> DraftResponse:
    return DraftResponse.model_validate(
        {
            "draft_id": "3f2b8c1e-5d4a-4e0b-9a77-0c1d2e3f4a5b",
            "original_file": {
                "filename": "a.pdf", "content_type": "application/pdf", "size_bytes": 10,
            },
            "fields": _all_fields(),
            "created_at": "2026-11-10T08:00:00Z",
            "updated_at": "2026-11-10T08:00:00Z",
            "expires_at": "2026-11-17T08:00:00Z",
        }
    )  # fmt: skip


def test_draft_response_dump_keys() -> None:
    d = _draft().model_dump(mode="json")
    assert set(d) == {
        "draft_id", "original_file", "fields", "created_at", "updated_at", "expires_at",
    }  # fmt: skip
    assert d["original_file"]["content_type"] == "application/pdf"


@pytest.mark.parametrize("bad", [0, 10485761])
def test_original_file_size_bounds(bad: int) -> None:
    with pytest.raises(ValidationError):
        OriginalFileInfo(filename="a.pdf", content_type="application/pdf", size_bytes=bad)
    OriginalFileInfo(filename="a.pdf", content_type="application/pdf", size_bytes=1)
    OriginalFileInfo(filename="a.pdf", content_type="image/png", size_bytes=10485760)


def test_original_file_content_type_enum() -> None:
    with pytest.raises(ValidationError):
        OriginalFileInfo(filename="a", content_type="text/plain", size_bytes=1)


def test_draft_update_request_requires_fields_and_forbids_extra() -> None:
    with pytest.raises(ValidationError):
        DraftUpdateRequest.model_validate({})
    with pytest.raises(ValidationError):
        DraftUpdateRequest.model_validate({"fields": {}, "x": 1})
    assert DraftUpdateRequest.model_validate({"fields": {"skills": []}}).fields.skills == []


def test_create_resume_request() -> None:
    assert CreateResumeRequest.model_validate({"confirmed": True}).confirmed is True
    with pytest.raises(ValidationError):
        CreateResumeRequest.model_validate({})
    with pytest.raises(ValidationError):
        CreateResumeRequest.model_validate({"confirmed": True, "x": 1})


def test_create_resume_response_dump() -> None:
    r = CreateResumeResponse(
        resume_id="3f2b8c1e-5d4a-4e0b-9a77-0c1d2e3f4a5b",
        already_saved=False,
        saved_at="2026-11-10T08:30:00Z",
    )
    assert r.model_dump(mode="json") == {
        "resume_id": "3f2b8c1e-5d4a-4e0b-9a77-0c1d2e3f4a5b",
        "already_saved": False,
        "saved_at": "2026-11-10T08:30:00Z",
    }


def test_error_response_omits_details_when_none() -> None:
    e = ErrorResponse(code=ErrorCode.INTERNAL_ERROR, message="m", request_id="r")
    assert e.model_dump(mode="json", exclude_none=True) == {
        "code": "internal_error", "message": "m", "request_id": "r",
    }  # fmt: skip


def test_error_response_with_details() -> None:
    e = ErrorResponse(
        code=ErrorCode.VALIDATION_FAILED,
        message="m",
        request_id="r",
        details=[ErrorDetail(field="phone", reason=IssueReason.INVALID_FORMAT)],
    )
    assert e.model_dump(mode="json")["details"] == [{"field": "phone", "reason": "invalid_format"}]


def test_raw_parse_result_wraps_untrusted_dict() -> None:
    r = RawParseResult(data={"name": {"value": "x", "status": "recognized"}})
    assert r.data["name"]["value"] == "x"


def test_raw_parse_result_token_usage_defaults_to_none() -> None:
    r = RawParseResult(data={}, prompt_tokens=10, completion_tokens=2)
    assert (r.prompt_tokens, r.completion_tokens) == (10, 2)
    assert RawParseResult(data={}).prompt_tokens is None
