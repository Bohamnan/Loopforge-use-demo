"""Deterministic validation of model suggestions (design 1 "suggestion pipeline", B-04).

The model output is untrusted. A pure function turns the leniently parsed candidates into the
suggestions a user may see; it reads no storage and writes no log. Per candidate, in order:

1. the field is one of the 19 whitelisted fields (work/project/education blocks never are)
2. the value has the shape of the field kind: text or null for scalars, list of text for lists
3. the value equals the current one (after trimming) -> dropped, there is nothing to change
4. name / phone / email: the normalised new value must occur in *this* user message
   (same normalisation as the idempotency key), otherwise dropped
5. the value passes the same validation as a manual edit; failure keeps the card visible as
   ``applicable=False`` with an enum reason (never the value)

Dropped candidates are not stored. Only the user can apply a suggestion.
"""

from dataclasses import dataclass

from pydantic import ValidationError

from app.schemas import limits as L
from app.schemas.chat import RawSuggestion, SuggestionValue
from app.schemas.resume_fields import ResumeFields, ResumeFieldsUpdate
from app.services.field_validation import issues_from_pydantic, strip_phone, validate_update
from app.services.identity_key import email_key, name_key, phone_key

assert set(L.SUGGESTION_FIELDS) <= set(ResumeFields.model_fields)  # keep in step with ResumeFields

_CORE = ("name", "phone", "email")
_REASONS = {"required", "invalid_format", "invalid_type", "too_long"}


@dataclass(frozen=True)
class SuggestionDraft:
    """A validated suggestion, ready to be stored (status starts as pending)."""

    field: str
    new_value: SuggestionValue
    applicable: bool
    reason: str | None  # enum code when not applicable; never contains the value


def _shape_ok(field: str, value: object) -> bool:
    if field in L.SUGGESTION_LIST_FIELDS:
        return isinstance(value, list) and all(isinstance(item, str) for item in value)
    return value is None or isinstance(value, str)


def _same_as_current(field: str, value: SuggestionValue, current: ResumeFields) -> bool:
    now = getattr(current, field).value
    if isinstance(value, list):
        return [item.strip() for item in value] == [item.strip() for item in now]
    return (value or "").strip() == (now or "").strip()


def occurs_in_message(field: str, value: object, message: str) -> bool:
    """Whether the normalised core value appears in the user's message (substring test)."""
    if not isinstance(value, str) or not value.strip():
        return False
    if field == "name":
        return name_key(value) in name_key(message)
    if field == "phone":
        return phone_key(value) in strip_phone(message)
    return email_key(value) in message.lower()


def _check(field: str, value: SuggestionValue) -> str | None:
    """Reason code when the value fails manual-edit validation, else ``None``."""
    try:
        update = ResumeFieldsUpdate.model_validate({field: value})
    except ValidationError as exc:
        issues = issues_from_pydantic(exc.errors())
        reason = issues[0].reason.value if issues else "invalid_type"
        return reason if reason in _REASONS else "invalid_type"
    issues = validate_update(update)
    return issues[0].reason.value if issues else None


def validate_suggestions(
    candidates: list[RawSuggestion], current: ResumeFields, user_message: str
) -> list[SuggestionDraft]:
    """Apply the pipeline; the result keeps the model's order."""
    drafts: list[SuggestionDraft] = []
    for item in candidates:
        field, value = item.field, item.new_value
        if field not in L.SUGGESTION_FIELDS or not _shape_ok(field, value):
            continue
        if _same_as_current(field, value, current):
            continue
        if field in _CORE and not occurs_in_message(field, value, user_message):
            continue
        reason = _check(field, value)
        drafts.append(SuggestionDraft(field, value, reason is None, reason))
    return drafts
