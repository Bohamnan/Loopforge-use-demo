"""Turns the untrusted model output into a trustworthy ``ResumeFields``.

The model output is data, never instructions: unknown keys are ignored, ``confirmed`` can
never come from the model (it becomes ``uncertain``), values without a basis are not
invented, and everything is clamped to the contract limits (REQ-BE-02.3, B-04).
Output invariant: ``missing`` <=> empty value; ``recognized``/``uncertain`` <=> non-empty.
"""

from typing import Any

from app.core.errors import ParseFailedError
from app.schemas import limits as L
from app.schemas.parse import RawParseResult
from app.schemas.resume_fields import (
    Education,
    EducationListField,
    FieldStatus,
    ProjectExperience,
    ProjectExperienceListField,
    ResumeFields,
    StringField,
    StringListField,
    WorkExperience,
    WorkExperienceListField,
)

_SCALAR_LIMITS = {"name": L.NAME_MAX, "phone": L.PHONE_MAX, "email": L.EMAIL_MAX}
_SCALAR_KEYS = [
    "name", "job_title", "expected_city", "expected_salary", "available_time", "phone", "email",
    "homepage", "gender", "birth_month", "political_status", "current_city", "work_years",
    "highest_education", "self_evaluation",
]  # fmt: skip
_TEXT_LIST_KEYS = ["strengths", "skills", "certificates_honors", "languages"]
_BLOCKS: dict[str, tuple[type, type]] = {
    "work_experiences": (WorkExperience, WorkExperienceListField),
    "project_experiences": (ProjectExperience, ProjectExperienceListField),
    "educations": (Education, EducationListField),
}
_ENTRY_LIST_KEYS = {"responsibilities", "achievements"}
_ALLOWED_CLAIMS = {
    "recognized": FieldStatus.RECOGNIZED,
    "uncertain": FieldStatus.UNCERTAIN,
    "missing": FieldStatus.MISSING,
}


def _split_node(raw_node: Any) -> tuple[Any, FieldStatus | None]:
    """Return (value, claimed status). Anything but the three allowed statuses -> None."""
    if not isinstance(raw_node, dict):
        return None, None
    claim = raw_node.get("status")
    claimed = _ALLOWED_CLAIMS.get(claim) if isinstance(claim, str) else None
    return raw_node.get("value"), claimed


def _text(value: Any, limit: int) -> tuple[str, bool]:
    """Coerce to trimmed text. Returns (text, degraded); unusable types give ('', False)."""
    if isinstance(value, str):
        text, degraded = value.strip(), False
    elif isinstance(value, int | float) and not isinstance(value, bool):
        text, degraded = str(value), True  # a number where text was expected
    else:
        return "", False
    if len(text) > limit:
        return text[:limit], True
    return text, degraded


def _list_item(item: Any, item_limit: int) -> tuple[str | None, bool]:
    """One list element: (text or None when dropped, degraded)."""
    if isinstance(item, str | int | float) and not isinstance(item, bool):
        text, degraded = _text(item, item_limit)
        return (text or None), degraded
    return None, item is not None  # an object or other junk inside a list of strings


def _string_items(value: Any, item_limit: int, max_items: int) -> tuple[list[str], bool]:
    """Clean a list of strings; returns (items, degraded)."""
    degraded = False
    if isinstance(value, str):
        value, degraded = [value], True
    if not isinstance(value, list):
        return [], False
    items: list[str] = []
    for raw in value:
        text, item_degraded = _list_item(raw, item_limit)
        degraded = degraded or item_degraded
        if text:
            items.append(text)
    if len(items) > max_items:
        items, degraded = items[:max_items], True
    return items, degraded


def _status(claimed: FieldStatus | None, degraded: bool) -> FieldStatus:
    if degraded or claimed is not FieldStatus.RECOGNIZED:
        return FieldStatus.UNCERTAIN  # unknown claims, 'missing' with a value, 'uncertain'
    return FieldStatus.RECOGNIZED


def _scalar_limit(key: str) -> int:
    return L.SELF_EVALUATION_MAX if key == "self_evaluation" else L.SCALAR_MAX


def _scalar(key: str, raw_node: Any) -> StringField:
    value, claimed = _split_node(raw_node)
    text, degraded = _text(value, _SCALAR_LIMITS.get(key, _scalar_limit(key)))
    if not text:
        return StringField(value=None, status=FieldStatus.MISSING)
    return StringField(value=text, status=_status(claimed, degraded))


def _text_list(raw_node: Any) -> StringListField:
    value, claimed = _split_node(raw_node)
    items, degraded = _string_items(value, L.TEXT_LIST_ITEM_MAX, L.TEXT_LIST_MAX_ITEMS)
    if not items:
        return StringListField(value=[], status=FieldStatus.MISSING)
    return StringListField(value=items, status=_status(claimed, degraded))


def _entry_value(name: str, value: Any) -> tuple[Any, bool]:
    """One entry attribute: (cleaned value, degraded)."""
    if name in _ENTRY_LIST_KEYS:
        return _string_items(value, L.ENTRY_STRING_MAX, L.ENTRY_LIST_MAX_ITEMS)
    text, bad = _text(value, L.ENTRY_STRING_MAX)
    if value is not None and not text and not isinstance(value, str):
        bad = True  # an unusable type was dropped
    return (text or None), bad


def _entry(cls: type, raw_entry: dict[str, Any]) -> tuple[Any | None, bool]:
    """Build one block entry; unknown keys are ignored. Returns (entry|None, degraded)."""
    data: dict[str, Any] = {}
    degraded = False
    for name in cls.model_fields:  # type: ignore[attr-defined]
        data[name], bad = _entry_value(name, raw_entry.get(name))
        degraded = degraded or bad
    if not any(data.values()):
        return None, degraded
    return cls(**data), degraded


def _block(key: str, raw_node: Any) -> Any:
    entry_cls, field_cls = _BLOCKS[key]
    value, claimed = _split_node(raw_node)
    degraded = False
    if isinstance(value, dict):
        value, degraded = [value], True
    entries: list[Any] = []
    for raw_entry in value if isinstance(value, list) else []:
        if not isinstance(raw_entry, dict):
            degraded = True
            continue
        entry, bad = _entry(entry_cls, raw_entry)
        degraded = degraded or bad
        if entry is not None:
            entries.append(entry)
    if len(entries) > L.BLOCK_MAX_ENTRIES:
        entries, degraded = entries[: L.BLOCK_MAX_ENTRIES], True
    if not entries:
        return field_cls(value=[], status=FieldStatus.MISSING)
    return field_cls(value=entries, status=_status(claimed, degraded))


def check_invariants(fields: ResumeFields) -> None:
    """Raise RuntimeError if the output breaks the status/value invariants (a bug, not input)."""
    for key in ResumeFields.model_fields:
        node = getattr(fields, key)
        empty = node.value is None or node.value == []
        if node.status is FieldStatus.CONFIRMED:
            raise RuntimeError(f"invariant violated: confirmed produced for {key}")
        if (node.status is FieldStatus.MISSING) != empty:
            raise RuntimeError(f"invariant violated: status/value mismatch for {key}")


def normalize(raw: RawParseResult) -> ResumeFields:
    """Normalise the model output. A non-object or an output with nothing usable fails."""
    data = raw.data
    if not isinstance(data, dict):
        raise ParseFailedError()
    nodes: dict[str, Any] = {}
    for key in _SCALAR_KEYS:
        nodes[key] = _scalar(key, data.get(key))
    for key in _TEXT_LIST_KEYS:
        nodes[key] = _text_list(data.get(key))
    for key in _BLOCKS:
        nodes[key] = _block(key, data.get(key))
    if all(node.status is FieldStatus.MISSING for node in nodes.values()):
        raise ParseFailedError()
    fields = ResumeFields(**nodes)
    check_invariants(fields)
    return fields
