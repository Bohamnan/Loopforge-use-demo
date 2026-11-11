"""Suggestion pipeline (task 2.10, HIGH_RISK B-04): deterministic table-driven checks.

No model is involved: the candidates are what a hostile or sloppy model could return.
"""

import pytest

from app.schemas.chat import RawSuggestion
from app.schemas.resume_fields import ResumeFields
from app.services.parse_normalizer import normalize
from app.services.suggestion_validation import validate_suggestions
from tests.fakes import make_raw_result

CURRENT: ResumeFields = normalize(make_raw_result())  # name ZHANG SAN, skills PYTHON/SQL, ...


def run(field: str, value: object, message: str = "") -> list:
    return validate_suggestions([RawSuggestion(field, value)], CURRENT, message)


@pytest.mark.parametrize(
    "field",
    ["work_experiences", "project_experiences", "educations", "id", "status", "__proto__", ""],
)
def test_fields_outside_the_whitelist_are_dropped(field: str) -> None:
    assert run(field, [{"company": "X"}], "anything") == []


@pytest.mark.parametrize(
    ("field", "value"),
    [("job_title", ["a"]), ("job_title", 5), ("job_title", {"k": 1}), ("skills", "Go"),
     ("skills", [1, 2]), ("skills", None), ("languages", [["x"]])],
)  # fmt: skip
def test_wrong_shape_for_the_field_kind_is_dropped(field: str, value: object) -> None:
    assert run(field, value) == []


def test_unchanged_values_are_dropped_after_trimming() -> None:
    assert run("job_title", "  BACKEND ENGINEER ") == []
    assert run("skills", [" PYTHON", "SQL "]) == []
    assert run("homepage", None) == []  # already empty


@pytest.mark.parametrize(
    ("field", "value", "message", "kept"),
    [
        ("name", "LI SI", "my name is LI SI", True),
        ("name", "LI   SI", "my name is LI SI", True),  # whitespace folded like the idempotency key
        ("name", "LI SI", "my name is WANG WU", False),  # not said by the user in this message
        ("name", None, "clear my name", False),
        ("phone", "13900139000", "call 139 0013-9000", True),
        ("phone", "+86 13900139000", "call 13900139000", True),
        ("phone", "13900139000", "13800138000", False),  # only in the resume/history, not here
        ("email", "Li@Example.com", "mail li@example.COM", True),
        ("email", "li@example.com", "no address given", False),
    ],
)
def test_name_phone_email_must_occur_in_this_users_message(
    field: str, value: object, message: str, kept: bool
) -> None:
    assert bool(run(field, value, message)) is kept


def test_other_fields_need_no_occurrence_check() -> None:
    (draft,) = run("current_city", "BEIJING", "")
    assert (draft.field, draft.applicable, draft.reason) == ("current_city", True, None)


@pytest.mark.parametrize(
    ("field", "value", "message", "reason"),
    [
        ("phone", "12ab", "set phone 12ab", "invalid_format"),
        ("email", "not-an-email", "mail not-an-email", "invalid_format"),
        ("job_title", "x" * 501, "", "too_long"),
        ("skills", ["x" * 1001], "", "too_long"),
    ],
)
def test_invalid_values_stay_visible_but_not_applicable_without_echoing_the_value(
    field: str, value: object, message: str, reason: str
) -> None:
    (draft,) = run(field, value, message)
    assert (draft.applicable, draft.reason) == (False, reason)
    assert "x" * 5 not in str(draft.reason) and "12ab" not in str(draft.reason)


def test_drop_happens_before_validation_so_invented_core_values_never_show() -> None:
    """An invalid *and* unmentioned phone is dropped, not shown as 'not applicable'."""
    assert run("phone", "not-a-phone", "I changed jobs") == []


def test_result_keeps_model_order_and_mixes_kept_and_dropped() -> None:
    drafts = validate_suggestions(
        [
            RawSuggestion("work_experiences", []),
            RawSuggestion("current_city", "BEIJING"),
            RawSuggestion("name", "FAKE NAME"),
            RawSuggestion("skills", ["Go"]),
        ],
        CURRENT,
        "I live in BEIJING now",
    )
    assert [d.field for d in drafts] == ["current_city", "skills"]
