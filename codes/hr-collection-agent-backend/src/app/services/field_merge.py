"""Pure field merge shared by the partial update (PATCH) and "apply suggestion" (B-04).

The only place that turns submitted values into ``confirmed`` field nodes: a field becomes
confirmed only through the user, either by editing it or by applying a suggestion.
"""

from pydantic import BaseModel

from app.schemas.resume_fields import (
    EducationListField,
    FieldStatus,
    ProjectExperienceListField,
    ResumeFields,
    ResumeFieldsUpdate,
    StringField,
    StringListField,
    WorkExperienceListField,
)

_TEXT_LIST_KEYS = {"strengths", "skills", "certificates_honors", "languages"}
_BLOCK_FIELDS = {
    "work_experiences": WorkExperienceListField,
    "project_experiences": ProjectExperienceListField,
    "educations": EducationListField,
}


def _clean_strings(items: list[str]) -> list[str]:
    """Trim every item and drop the blank ones."""
    return [item.strip() for item in items if item.strip()]


def _clean_entry(entry: BaseModel) -> BaseModel | None:
    """Trim an entry's strings and drop blank list items; ``None`` if nothing is left."""
    data: dict[str, object] = {}
    for name, value in entry.model_dump().items():
        if isinstance(value, list):
            data[name] = _clean_strings(value)
        elif isinstance(value, str):
            data[name] = value.strip() or None
        else:
            data[name] = value
    if not any(data.values()):
        return None
    return type(entry)(**data)


def _confirmed_node(key: str, value: object):  # noqa: ANN202
    """The node for a submitted field: the value is final, the status is ``confirmed``.

    Blank list items and entries without any content are dropped (same rule as ``normalize``);
    a list that ends up empty is a confirmed empty field.
    """
    if key in _TEXT_LIST_KEYS:
        return StringListField(
            value=_clean_strings(value),  # type: ignore[arg-type]
            status=FieldStatus.CONFIRMED,
        )
    if key in _BLOCK_FIELDS:
        entries = [e for e in map(_clean_entry, value) if e is not None]  # type: ignore[call-overload]
        return _BLOCK_FIELDS[key](value=entries, status=FieldStatus.CONFIRMED)
    text = value.strip() if isinstance(value, str) else None
    return StringField(value=text or None, status=FieldStatus.CONFIRMED)  # blank = confirmed empty


def merge_update(fields: ResumeFields, update: ResumeFieldsUpdate) -> ResumeFields:
    """Apply a partial update: present keys are replaced and confirmed, the rest is unchanged."""
    changes = {key: _confirmed_node(key, getattr(update, key)) for key in update.model_fields_set}
    return fields.model_copy(update=changes)
