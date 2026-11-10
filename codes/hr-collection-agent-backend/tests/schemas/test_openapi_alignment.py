"""Schemas must stay aligned with the frozen OpenAPI 0.1.1."""

from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from app.schemas import limits as L
from app.schemas.resume_fields import ResumeFields, ResumeFieldsUpdate
from tests.schemas.test_dtos import _draft

OPENAPI = Path(__file__).resolve().parents[4] / "backend-docs/HR_PR-1/03_api/openapi.yaml"
pytestmark = pytest.mark.skipif(not OPENAPI.exists(), reason="frozen openapi.yaml not found")


@pytest.fixture(scope="module")
def spec() -> dict:
    return yaml.safe_load(OPENAPI.read_text())


def _validator(spec: dict, name: str) -> Draft202012Validator:
    return Draft202012Validator(
        {"$ref": f"#/components/schemas/{name}", "components": spec["components"]}
    )


def test_version(spec: dict) -> None:
    assert spec["info"]["version"] == "0.1.1"


def test_draft_response_conforms(spec: dict) -> None:
    errors = list(_validator(spec, "DraftResponse").iter_errors(_draft().model_dump(mode="json")))
    assert errors == []


def test_field_names_match(spec: dict) -> None:
    s = spec["components"]["schemas"]
    assert list(ResumeFields.model_fields) == list(s["ResumeFields"]["properties"])
    assert list(ResumeFieldsUpdate.model_fields) == list(s["ResumeFieldsUpdate"]["properties"])


def test_limits_match_openapi(spec: dict) -> None:
    p = spec["components"]["schemas"]["ResumeFieldsUpdate"]["properties"]
    assert p["name"]["maxLength"] == L.NAME_MAX
    assert p["phone"]["maxLength"] == L.PHONE_MAX
    assert p["email"]["maxLength"] == L.EMAIL_MAX
    assert p["job_title"]["maxLength"] == L.SCALAR_MAX
    assert p["self_evaluation"]["maxLength"] == L.SELF_EVALUATION_MAX
    assert p["skills"]["maxItems"] == L.TEXT_LIST_MAX_ITEMS
    assert p["skills"]["items"]["maxLength"] == L.TEXT_LIST_ITEM_MAX
    assert p["work_experiences"]["maxItems"] == L.BLOCK_MAX_ENTRIES
    s = spec["components"]["schemas"]
    assert s["WorkExperience"]["properties"]["company"]["maxLength"] == L.ENTRY_STRING_MAX
    assert (
        s["WorkExperience"]["properties"]["responsibilities"]["maxItems"] == L.ENTRY_LIST_MAX_ITEMS
    )


def test_patterns_match_openapi(spec: dict) -> None:
    p = spec["components"]["schemas"]["ResumeFieldsUpdate"]["properties"]
    assert p["phone"]["pattern"] == L.PHONE_PATTERN
    assert p["email"]["pattern"] == L.EMAIL_PATTERN
