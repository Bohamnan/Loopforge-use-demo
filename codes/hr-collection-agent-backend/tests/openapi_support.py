"""Helpers to validate API payloads against the frozen OpenAPI document."""

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


def schema_errors(schema_name: str, payload: object) -> list[str]:
    """Validation errors of ``payload`` against ``components.schemas[schema_name]``."""
    spec = load_spec()
    validator = Draft202012Validator(
        {"$ref": f"#/components/schemas/{schema_name}", "components": spec["components"]}
    )
    return [e.message for e in validator.iter_errors(payload)]
