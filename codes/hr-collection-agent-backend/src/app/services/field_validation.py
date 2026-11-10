"""Field validation shared by draft update and confirm-save (single implementation point).

Issues carry only a field path and a reason code, never the submitted value (B-03, D-06).
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.core.errors import FieldIssue, IssueReason
from app.schemas import limits as L
from app.schemas.resume_fields import ResumeFieldsUpdate

# re.ASCII: \d must match only 0-9, like the OpenAPI pattern and the frontend (ECMA-262).
_PHONE_RE = re.compile(L.PHONE_PATTERN, re.ASCII)
# Email is intentionally lenient (G-01) and has no \d; \s only rejects whitespace.
_EMAIL_RE = re.compile(L.EMAIL_PATTERN)
_PHONE_NOISE_RE = re.compile(r"[\s\-]")

_CORE_LIMITS = {"name": L.NAME_MAX, "phone": L.PHONE_MAX, "email": L.EMAIL_MAX}


def strip_phone(raw: str) -> str:
    """Remove spaces and hyphens; the phone pattern applies to the result (G-02)."""
    return _PHONE_NOISE_RE.sub("", raw)


def _check_core(field: str, value: str | None) -> FieldIssue | None:
    """Validate one core field (name / phone / email); return the first problem found."""
    text = (value or "").strip()
    if not text:
        return FieldIssue(field, IssueReason.REQUIRED)
    if len(text) > _CORE_LIMITS[field]:
        return FieldIssue(field, IssueReason.TOO_LONG)
    if field == "phone" and not _PHONE_RE.fullmatch(strip_phone(text)):
        return FieldIssue(field, IssueReason.INVALID_FORMAT)
    if field == "email" and not _EMAIL_RE.fullmatch(text):
        return FieldIssue(field, IssueReason.INVALID_FORMAT)
    return None


def validate_core_fields(
    name: str | None, phone: str | None, email: str | None
) -> list[FieldIssue]:
    """Validate the three required fields; all problems are collected in one pass."""
    candidates = (("name", name), ("phone", phone), ("email", email))
    return [issue for field, value in candidates if (issue := _check_core(field, value))]


def core_issues_from_raw(fields: object) -> list[FieldIssue]:
    """Semantic problems of name/phone/email in a raw (not yet parsed) ``fields`` object.

    Used when the request body already failed schema validation, so that the response still
    lists every problem at once. Non-string values are left to the schema errors.
    """
    if not isinstance(fields, Mapping):
        return []
    issues = []
    for field in ("name", "phone", "email"):
        value = fields.get(field)
        if isinstance(value, str) and (issue := _check_core(field, value)):
            issues.append(issue)
    return issues


def validate_update(update: ResumeFieldsUpdate) -> list[FieldIssue]:
    """Validate a parsed partial update: only core fields that are present are checked.

    Length, type and unknown-key problems are already enforced by the schema and are
    translated by :func:`issues_from_pydantic`.
    """
    present = update.model_fields_set
    if not present:
        return [FieldIssue("fields", IssueReason.REQUIRED)]
    issues = []
    for field in ("name", "phone", "email"):
        if field in present and (issue := _check_core(field, getattr(update, field))):
            issues.append(issue)
    return issues


def _reason_for(error_type: str) -> IssueReason:
    if error_type == "missing":
        return IssueReason.REQUIRED
    if error_type.endswith("too_long"):
        return IssueReason.TOO_LONG
    if error_type.endswith("too_short"):
        return IssueReason.REQUIRED
    if error_type == "extra_forbidden":
        return IssueReason.UNKNOWN_FIELD
    if error_type in {"string_pattern_mismatch", "json_invalid", "literal_error", "enum"}:
        return IssueReason.INVALID_FORMAT
    return IssueReason.INVALID_TYPE


def _path(loc: Sequence[str | int]) -> str:
    parts = list(loc)
    if parts and parts[0] == "body":
        parts = parts[1:]
    if len(parts) > 1 and parts[0] == "fields":
        parts = parts[1:]
    path = ""
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        else:
            path += f".{part}" if path else str(part)
    return path or "body"


def issues_from_pydantic(errors: Sequence[Mapping[str, Any]]) -> list[FieldIssue]:
    """Translate Pydantic error dicts to issues; ``input`` and ``msg`` are discarded."""
    seen: dict[FieldIssue, None] = {}
    for err in errors:
        seen[FieldIssue(_path(err["loc"]), _reason_for(str(err["type"])))] = None
    return list(seen)
