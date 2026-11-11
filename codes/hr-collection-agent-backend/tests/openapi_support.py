"""Read-only helpers for the frozen OpenAPI document (0.2.0).

The document lives in ``backend-docs`` and is never edited from here. Tests validate payloads
against it with ``jsonschema`` (draft 2020-12, the dialect OpenAPI 3.1 uses).
"""

from functools import lru_cache
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

OPENAPI_PATH = Path(__file__).resolve().parents[3] / "backend-docs/HR_PR-1/03_api/openapi.yaml"


def openapi_available() -> bool:
    return OPENAPI_PATH.exists()


@lru_cache(maxsize=1)
def load_spec() -> dict:
    return yaml.safe_load(OPENAPI_PATH.read_text())


def validate_against(schema: dict, payload: object) -> list[str]:
    """Validation messages of ``payload`` against ``schema`` (may use local ``$ref``s)."""
    validator = Draft202012Validator({**schema, "components": load_spec()["components"]})
    return [e.message for e in validator.iter_errors(payload)]


def schema_errors(schema_name: str, payload: object) -> list[str]:
    """Validation errors of ``payload`` against ``components.schemas[schema_name]``."""
    return validate_against({"$ref": f"#/components/schemas/{schema_name}"}, payload)
