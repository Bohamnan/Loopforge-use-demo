import pytest
from pydantic import ValidationError

from app.core.errors import FieldIssue
from app.schemas.draft import DraftUpdateRequest
from app.schemas.resume_fields import ResumeFieldsUpdate
from app.services.field_validation import (
    issues_from_pydantic,
    strip_phone,
    validate_core_fields,
    validate_update,
)

GOOD = ("ZZ合成姓名", "13800138000", "zz@example.com")


def _u(**kw: object) -> ResumeFieldsUpdate:
    return ResumeFieldsUpdate.model_validate(kw)


def _fmt(issues: list[FieldIssue]) -> set[tuple[str, str]]:
    return {(i.field, i.reason.value) for i in issues}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("138 0013 8000", "13800138000"),
        ("138-0013-8000", "13800138000"),
        (" +852 1234-5678", "+85212345678"),
    ],
)
def test_strip_phone(raw: str, expected: str) -> None:
    assert strip_phone(raw) == expected


@pytest.mark.parametrize(
    "phone",
    ["13800138000", "138 0013 8000", "138-0013-8000", "+85212345678", "+8613800138000", "+123456"],
)
def test_valid_phones(phone: str) -> None:
    assert validate_core_fields(GOOD[0], phone, GOOD[2]) == []


@pytest.mark.parametrize(
    "phone",
    [
        "12345",
        "+123",
        "23800138000",
        "1380013800",
        "138001380001",
        "+1234567890123456",
        "abc",
        "13800138000x",
    ],
)
def test_invalid_phones(phone: str) -> None:
    assert _fmt(validate_core_fields(GOOD[0], phone, GOOD[2])) == {("phone", "invalid_format")}


@pytest.mark.parametrize("email", ["zz@example.com", "a.b+c@sub.example.org", " zz@example.com "])
def test_valid_emails(email: str) -> None:
    assert validate_core_fields(GOOD[0], GOOD[1], email) == []


@pytest.mark.parametrize(
    "email", ["zz", "zz@", "@example.com", "zz@example", "a b@example.com", "a@@b.cc"]
)
def test_invalid_emails(email: str) -> None:
    assert _fmt(validate_core_fields(GOOD[0], GOOD[1], email)) == {("email", "invalid_format")}


def test_email_length_boundary() -> None:
    local = "a" * (254 - len("@e.cc"))
    assert validate_core_fields(GOOD[0], GOOD[1], f"{local}@e.cc") == []
    too_long = f"{local}a@e.cc"
    assert _fmt(validate_core_fields(GOOD[0], GOOD[1], too_long)) == {("email", "too_long")}


@pytest.mark.parametrize("blank", [None, "", "   ", "\t\n"])
def test_blank_core_fields_are_required(blank: str | None) -> None:
    assert _fmt(validate_core_fields(blank, blank, blank)) == {
        ("name", "required"), ("phone", "required"), ("email", "required"),
    }  # fmt: skip


def test_all_problems_collected_in_one_pass() -> None:
    issues = validate_core_fields("", "12", "bad")
    assert _fmt(issues) == {
        ("name", "required"), ("phone", "invalid_format"), ("email", "invalid_format"),
    }  # fmt: skip


def test_issues_never_carry_values() -> None:
    issues = validate_core_fields("ZZ-secret", "ZZ-secret-phone", "ZZ-secret-mail")
    assert all("ZZ-secret" not in repr(i) for i in issues)


# ---- validate_update -----------------------------------------------------------


def test_update_checks_only_present_core_fields() -> None:
    assert validate_update(_u(skills=["Python"])) == []
    assert validate_update(_u(name="张三")) == []


def test_update_whitespace_only_name_is_required() -> None:
    assert _fmt(validate_update(_u(name="   "))) == {("name", "required")}


def test_update_phone_with_spaces_accepted_fallback() -> None:
    assert validate_update(_u(phone="138 0013 8000")) == []


def test_update_bad_phone_and_email() -> None:
    assert _fmt(validate_update(_u(phone="12", email="x"))) == {
        ("phone", "invalid_format"), ("email", "invalid_format"),
    }  # fmt: skip


def test_empty_update_is_required_error() -> None:
    assert _fmt(validate_update(_u())) == {("fields", "required")}


# ---- issues_from_pydantic ------------------------------------------------------


def _errs(payload: dict) -> list[FieldIssue]:
    with pytest.raises(ValidationError) as ei:
        DraftUpdateRequest.model_validate({"fields": payload})
    return issues_from_pydantic(ei.value.errors())


def test_pydantic_unknown_field() -> None:
    assert _fmt(_errs({"nick": "x"})) == {("nick", "unknown_field")}


def test_pydantic_too_long_scalar_and_list_and_block() -> None:
    issues = _errs(
        {
            "name": "a" * 101,
            "skills": ["a"] * 51,
            "work_experiences": [{}] * 21,
            "strengths": ["a" * 1001],
        }
    )
    assert _fmt(issues) == {
        ("name", "too_long"), ("skills", "too_long"), ("work_experiences", "too_long"),
        ("strengths[0]", "too_long"),
    }  # fmt: skip


def test_pydantic_nested_path_and_type() -> None:
    issues = _errs({"work_experiences": [{"company": "ok"}, {"start_date": 5}]})
    assert _fmt(issues) == {("work_experiences[1].start_date", "invalid_type")}


def test_pydantic_wrong_type_and_null_core() -> None:
    assert _fmt(_errs({"skills": "Python", "name": None})) == {
        ("skills", "invalid_type"), ("name", "invalid_type"),
    }  # fmt: skip


def test_pydantic_empty_string_core_is_required() -> None:
    assert _fmt(_errs({"phone": ""})) == {("phone", "required")}


def test_pydantic_missing_fields_key() -> None:
    with pytest.raises(ValidationError) as ei:
        DraftUpdateRequest.model_validate({})
    assert _fmt(issues_from_pydantic(ei.value.errors())) == {("fields", "required")}


def test_pydantic_issues_are_deduplicated_and_value_free() -> None:
    issues = _errs({"nick": "ZZ-secret", "name": "ZZ" * 100})
    assert all("ZZ" not in repr(i) for i in issues)
    assert len(issues) == len(set(issues))
