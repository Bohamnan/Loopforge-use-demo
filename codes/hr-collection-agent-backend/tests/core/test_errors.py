from pathlib import Path

import pytest
import yaml

from app.core import errors as e
from app.core.errors import AppError, ErrorCode, FieldIssue, IssueReason

OPENAPI = Path(__file__).resolve().parents[4] / "backend-docs/HR_PR-1/03_api/openapi.yaml"

EXPECTED = {
    e.FileMissingError: ("file_missing", 400),
    e.FileEmptyError: ("file_empty", 400),
    e.FileContentMismatchError: ("file_content_mismatch", 400),
    e.FileTooLargeError: ("file_too_large", 413),
    e.UnsupportedFileTypeError: ("unsupported_file_type", 415),
    e.ParseFailedError: ("parse_failed", 502),
    e.ParseUnavailableError: ("parse_unavailable", 503),
    e.ParseTimeoutError: ("parse_timeout", 504),
    e.DraftNotFoundError: ("draft_not_found", 404),
    e.ValidationFailedError: ("validation_failed", 422),
    e.ConfirmationRequiredError: ("confirmation_required", 422),
    e.SaveFailedError: ("save_failed", 500),
    e.InternalError: ("internal_error", 500),
}


@pytest.mark.parametrize(("cls", "expected"), list(EXPECTED.items()))
def test_code_and_status(cls: type[AppError], expected: tuple[str, int]) -> None:
    err = cls()
    assert (err.code.value, err.http_status) == expected
    assert isinstance(err, AppError) and isinstance(err, Exception)
    assert err.message


def test_all_13_codes_covered() -> None:
    assert len(ErrorCode) == 13
    assert {c.value for c in ErrorCode} == {v[0] for v in EXPECTED.values()}


def test_details_only_on_validation_failed() -> None:
    issues = [FieldIssue("phone", IssueReason.INVALID_FORMAT)]
    err = e.ValidationFailedError(issues)
    assert err.details == issues
    for cls in EXPECTED:
        if cls is not e.ValidationFailedError:
            assert cls().details is None


def test_issue_reasons_match_contract() -> None:
    assert {r.value for r in IssueReason} == {
        "required", "invalid_format", "invalid_type", "too_long", "unknown_field",
    }  # fmt: skip


def test_message_does_not_embed_user_data() -> None:
    # The constructors accept no free-form message, so user data cannot leak in.
    with pytest.raises(TypeError):
        e.DraftNotFoundError("ZZ-user-data")  # type: ignore[call-arg]
    assert "ZZ" not in e.ParseFailedError().message


def test_cause_is_preserved() -> None:
    cause = ValueError("x")
    try:
        raise e.ParseFailedError() from cause
    except e.ParseFailedError as err:
        assert err.__cause__ is cause


def test_duplicate_identity_error_is_not_app_error() -> None:
    assert not issubclass(e.DuplicateIdentityError, AppError)


@pytest.mark.skipif(not OPENAPI.exists(), reason="frozen openapi.yaml not found in this checkout")
def test_matches_frozen_openapi() -> None:
    spec = yaml.safe_load(OPENAPI.read_text())
    enum = spec["components"]["schemas"]["ErrorCode"]["enum"]
    assert [c.value for c in ErrorCode] == enum
    reasons = spec["components"]["schemas"]["ErrorDetail"]["properties"]["reason"]["enum"]
    assert [r.value for r in IssueReason] == reasons
    examples = spec["components"]["examples"]
    messages = {}
    for ex in examples.values():
        v = ex["value"]
        messages[v["code"]] = v["message"]
    for cls, (code, _) in EXPECTED.items():
        assert cls().message == messages[code]
