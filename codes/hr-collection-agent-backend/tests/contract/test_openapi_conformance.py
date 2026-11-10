"""Contract tests against the frozen OpenAPI 0.1.1 (task 3.1). The contract is never edited here.

What is checked, all derived from the frozen document itself:

* paths, methods and ``operationId`` of ``app.openapi()`` equal the frozen ones;
* every (path, method, status) of the frozen document is produced by a real request, and the
  body validates against the schema the document names for that status (``jsonschema``);
* error ``code`` values are those of the document's examples; ``Set-Cookie`` follows the
  header descriptions;
* every ``maxLength`` / ``maxItems`` / ``pattern`` of the update schemas matches the code, and
  the server rejects one over the limit with ``too_long`` while accepting exactly the limit.

Known, deliberate difference: ``app.openapi()`` is FastAPI's auto-generated document and only
lists the success statuses plus its default 422; the error responses are produced by the
unified error handlers. The status sets are therefore compared through real responses (above),
not through ``app.openapi()``.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from app.core.config import Settings
from app.core.db import init_drafts_db, init_resumes_db
from app.core.errors import ParseFailedError, ParseTimeoutError, ParseUnavailableError
from app.main import create_app
from app.repositories.archive_file_store import ArchiveFileStore
from app.schemas.resume_fields import ResumeFieldsUpdate
from app.services.draft_service import DraftService
from app.services.resume_service import ResumeService
from tests.fakes import FakeClock, FakeParserClient, make_raw_result
from tests.helpers import make_pdf_bytes
from tests.openapi_support import OPENAPI_PATH, load_spec, openapi_available

pytestmark = pytest.mark.skipif(not openapi_available(), reason="frozen openapi.yaml not found")

UPLOAD = "/api/v1/resume-drafts"
CURRENT = "/api/v1/resume-drafts/current"
RESUMES = "/api/v1/resumes"
METHODS = ("get", "post", "patch", "put", "delete")


# ---- reading the frozen document --------------------------------------------------------------


def resolve(ref_or_obj: dict) -> dict:
    """Follow a local ``$ref`` (``#/components/...``)."""
    node = ref_or_obj
    while "$ref" in node:
        target = load_spec()
        for part in node["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        node = target
    return node


def frozen_operations() -> dict[tuple[str, str], dict]:
    return {
        (path, method): op
        for path, item in load_spec()["paths"].items()
        for method, op in item.items()
        if method in METHODS
    }


def frozen_triples() -> set[tuple[str, str, int]]:
    return {
        (path, method, int(status))
        for (path, method), op in frozen_operations().items()
        for status in op["responses"]
    }


def response_schema(path: str, method: str, status: int) -> dict:
    response = resolve(frozen_operations()[(path, method)]["responses"][str(status)])
    return response["content"]["application/json"]["schema"]


def documented_codes(path: str, method: str, status: int) -> set[str]:
    """Error codes a documented response names: its examples plus codes in its description."""
    response = resolve(frozen_operations()[(path, method)]["responses"][str(status)])
    examples = response["content"]["application/json"].get("examples", {})
    codes = {resolve(e)["value"]["code"] for e in examples.values()}
    enum = load_spec()["components"]["schemas"]["ErrorCode"]["enum"]
    return codes | {c for c in enum if re.search(rf"\b{c}\b", response["description"])}


def validate(schema: dict, payload: object) -> list[str]:
    validator = Draft202012Validator({**schema, "components": load_spec()["components"]})
    return [e.message for e in validator.iter_errors(payload)]


# ---- test environment -------------------------------------------------------------------------


@dataclass
class Api:
    client: TestClient
    settings: Settings
    parser: FakeParserClient

    def upload(
        self, content: bytes | None = None, name: str = "cv.pdf", mime: str = "application/pdf"
    ):  # noqa: ANN201
        data = make_pdf_bytes(300) if content is None else content
        return self.client.post(UPLOAD, files={"file": (name, data, mime)})


def build_api(root: Path) -> Api:
    data, files = root / "data", root / "file"
    data.mkdir(parents=True), files.mkdir(parents=True)
    settings = Settings(_env_file=None, data_dir=data, file_dir=files)
    init_drafts_db(data / "drafts.db")
    init_resumes_db(data / "resumes.db")
    parser = FakeParserClient(result=make_raw_result())
    app = create_app(settings, parser_client=parser, clock=FakeClock())
    return Api(TestClient(app, raise_server_exceptions=False), settings, parser)


def boom(*args: object, **kwargs: object) -> None:
    raise RuntimeError("ZZ-secret-boom")


# ---- scenarios: one real request per documented (path, method, status) ------------------------


@dataclass(frozen=True)
class Scenario:
    path: str
    method: str
    status: int
    code: str | None  # expected error code, None for successes
    run: Callable[[Api, pytest.MonkeyPatch], object]


def _parse_error(error: Exception) -> Callable[[Api, pytest.MonkeyPatch], object]:
    def run(api: Api, mp: pytest.MonkeyPatch) -> object:
        api.parser.error = error
        return api.upload()

    return run


def _upload_ok(api: Api, mp: pytest.MonkeyPatch) -> object:
    return api.upload()


def _get_ok(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.upload()
    return api.client.get(CURRENT)


def _patch_ok(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.upload()
    return api.client.patch(CURRENT, json={"fields": {"skills": ["Python"]}})


def _patch_invalid(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.upload()
    return api.client.patch(CURRENT, json={"fields": {"phone": "bad", "email": ""}})


def _confirm_new(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.upload()
    return api.client.post(RESUMES, json={"confirmed": True})


def _confirm_again(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.upload()
    api.client.post(RESUMES, json={"confirmed": True})
    api.upload()
    return api.client.post(RESUMES, json={"confirmed": True})


def _confirm_without_confirmation(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.upload()
    return api.client.post(RESUMES, json={"confirmed": False})


def _confirm_invalid_identity(api: Api, mp: pytest.MonkeyPatch) -> object:
    api.parser.result = make_raw_result(phone={"value": "bad", "status": "recognized"})
    api.upload()
    return api.client.post(RESUMES, json={"confirmed": True})


def _confirm_save_failed(api: Api, mp: pytest.MonkeyPatch) -> object:
    mp.setattr(ArchiveFileStore, "stage", boom)
    api.upload()
    return api.client.post(RESUMES, json={"confirmed": True})


def _get_current(api: Api) -> object:
    return api.client.get(CURRENT)


def _patch_current(api: Api) -> object:
    return api.client.patch(CURRENT, json={"fields": {"skills": []}})


def _post_confirmed(api: Api) -> object:
    return api.client.post(RESUMES, json={"confirmed": True})


def _internal(cls: type, name: str, call: Callable[[Api], object]):  # noqa: ANN202
    def run(api: Api, mp: pytest.MonkeyPatch) -> object:
        api.upload()
        mp.setattr(cls, name, boom)
        return call(api)

    return run


SCENARIOS: dict[str, Scenario] = {
    s_id: s
    for s_id, s in {
        "upload_201": Scenario(UPLOAD, "post", 201, None, _upload_ok),
        "upload_400_file_missing": Scenario(
            UPLOAD, "post", 400, "file_missing",
            lambda api, mp: api.client.post(UPLOAD, data={"other": "x"}),
        ),
        "upload_400_file_empty": Scenario(
            UPLOAD, "post", 400, "file_empty", lambda api, mp: api.upload(b"")
        ),
        "upload_400_file_content_mismatch": Scenario(
            UPLOAD, "post", 400, "file_content_mismatch",
            lambda api, mp: api.upload(b"not a pdf at all", "cv.pdf"),
        ),
        "upload_413_file_too_large": Scenario(
            UPLOAD, "post", 413, "file_too_large",
            lambda api, mp: api.upload(make_pdf_bytes(10 * 1024 * 1024 + 1)),
        ),
        "upload_415_unsupported_file_type": Scenario(
            UPLOAD, "post", 415, "unsupported_file_type",
            lambda api, mp: api.upload(b"x", "cv.exe", "application/octet-stream"),
        ),
        "upload_502_parse_failed": Scenario(
            UPLOAD, "post", 502, "parse_failed", _parse_error(ParseFailedError())
        ),
        "upload_503_parse_unavailable": Scenario(
            UPLOAD, "post", 503, "parse_unavailable", _parse_error(ParseUnavailableError())
        ),
        "upload_504_parse_timeout": Scenario(
            UPLOAD, "post", 504, "parse_timeout", _parse_error(ParseTimeoutError())
        ),
        "upload_500_internal_error": Scenario(
            UPLOAD, "post", 500, "internal_error", _parse_error(RuntimeError("ZZ-secret-boom"))
        ),
        "get_200": Scenario(CURRENT, "get", 200, None, _get_ok),
        "get_404": Scenario(
            CURRENT, "get", 404, "draft_not_found", lambda api, mp: _get_current(api)
        ),
        "get_500": Scenario(
            CURRENT, "get", 500, "internal_error", _internal(DraftService, "get", _get_current)
        ),
        "patch_200": Scenario(CURRENT, "patch", 200, None, _patch_ok),
        "patch_404": Scenario(
            CURRENT, "patch", 404, "draft_not_found",
            lambda api, mp: api.client.patch(CURRENT, json={"fields": {"skills": []}}),
        ),
        "patch_422": Scenario(CURRENT, "patch", 422, "validation_failed", _patch_invalid),
        "patch_500": Scenario(
            CURRENT, "patch", 500, "internal_error",
            _internal(DraftService, "update", _patch_current),
        ),
        "confirm_201": Scenario(RESUMES, "post", 201, None, _confirm_new),
        "confirm_200": Scenario(RESUMES, "post", 200, None, _confirm_again),
        "confirm_404": Scenario(
            RESUMES, "post", 404, "draft_not_found",
            lambda api, mp: api.client.post(RESUMES, json={"confirmed": True}),
        ),
        "confirm_422_confirmation_required": Scenario(
            RESUMES, "post", 422, "confirmation_required", _confirm_without_confirmation
        ),
        "confirm_422_validation_failed": Scenario(
            RESUMES, "post", 422, "validation_failed", _confirm_invalid_identity
        ),
        "confirm_500_save_failed": Scenario(
            RESUMES, "post", 500, "save_failed", _confirm_save_failed
        ),
        "confirm_500_internal_error": Scenario(
            RESUMES, "post", 500, "internal_error",
            _internal(ResumeService, "confirm", _post_confirmed),
        ),
    }.items()
}  # fmt: skip


def cookie_attrs(header: str) -> dict[str, str]:
    parts = [p.strip() for p in header.split(";")]
    attrs = {p.partition("=")[0]: p.partition("=")[2] for p in parts[1:]}
    attrs["__value__"] = parts[0].partition("=")[2]
    return attrs


def assert_conforms(s: Scenario, response) -> None:  # noqa: ANN001
    """Status, body schema, error code and cookie behaviour of one real response."""
    assert response.status_code == s.status, response.text
    assert (s.path, s.method, s.status) in frozen_triples()
    assert validate(response_schema(s.path, s.method, s.status), response.json()) == []
    body = response.json()
    if s.code is not None:
        assert body["code"] == s.code
        assert s.code in documented_codes(s.path, s.method, s.status)
        assert "ZZ-secret" not in response.text  # B-03: no internal detail
    cookies = response.headers.get_list("set-cookie")
    documented = resolve(frozen_operations()[(s.path, s.method)]["responses"][str(s.status)])
    header_doc = documented.get("headers", {}).get("Set-Cookie")
    if header_doc is None:
        assert cookies == [], "an undocumented Set-Cookie was sent"
        return
    assert len(cookies) == 1
    attrs = cookie_attrs(cookies[0])
    assert {"HttpOnly", "Path", "SameSite"} <= set(attrs) and attrs["Path"] == "/"
    assert attrs["SameSite"] == "Lax"
    (max_age,) = re.findall(r"Max-Age\D*?(\d+)", header_doc["description"])
    assert attrs["Max-Age"] == max_age
    assert (attrs["__value__"] == "") == (max_age == "0")  # cleared <=> Max-Age=0


@pytest.mark.parametrize("scenario_id", list(SCENARIOS))
def test_real_response_conforms_to_the_frozen_contract(
    scenario_id: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    s = SCENARIOS[scenario_id]
    api = build_api(tmp_path)
    assert_conforms(s, s.run(api, monkeypatch))


def test_every_documented_status_is_produced_by_a_scenario() -> None:
    """The scenario table covers exactly the frozen (path, method, status) triples."""
    assert {(s.path, s.method, s.status) for s in SCENARIOS.values()} == frozen_triples()


def test_every_documented_error_code_is_produced() -> None:
    produced = {s.code for s in SCENARIOS.values() if s.code}
    enum = set(load_spec()["components"]["schemas"]["ErrorCode"]["enum"])
    assert produced == enum


def test_renewed_cookie_keeps_the_same_token(tmp_path: Path) -> None:
    api = build_api(tmp_path)
    api.upload()
    token = api.client.cookies.get("draft_token")
    for response in (
        api.client.get(CURRENT),
        api.client.patch(CURRENT, json={"fields": {"skills": []}}),
    ):
        assert cookie_attrs(response.headers["set-cookie"])["__value__"] == token


def test_failed_upload_leaves_the_existing_cookie_and_draft_alone(tmp_path: Path) -> None:
    """O-02: a failure does not change the browser's cookie or draft."""
    api = build_api(tmp_path)
    api.upload()
    token = api.client.cookies.get("draft_token")
    before = api.client.get(CURRENT).json()

    failed = api.upload(b"not a pdf at all")

    assert failed.status_code == 400 and "set-cookie" not in failed.headers
    assert api.client.cookies.get("draft_token") == token
    assert api.client.get(CURRENT).json()["draft_id"] == before["draft_id"]


# ---- paths, methods, operationIds -------------------------------------------------------------


def test_paths_methods_and_operation_ids_match_the_frozen_document() -> None:
    generated = create_app(Settings(_env_file=None)).openapi()
    expected = {
        (path, method): op["operationId"] for (path, method), op in frozen_operations().items()
    }
    actual = {
        (path, method): op["operationId"]
        for path, item in generated["paths"].items()
        for method, op in item.items()
        if method in METHODS
    }
    assert actual == expected


def test_success_statuses_match_the_frozen_document() -> None:
    generated = create_app(Settings(_env_file=None)).openapi()
    for (path, method), op in frozen_operations().items():
        frozen_ok = {s for s in op["responses"] if s.startswith("2")}
        actual_ok = {s for s in generated["paths"][path][method]["responses"] if s.startswith("2")}
        assert actual_ok == frozen_ok, (path, method)


def test_version_is_the_frozen_one_and_file_is_the_expected_file() -> None:
    assert load_spec()["info"]["version"] == "0.1.1"
    assert OPENAPI_PATH.name == "openapi.yaml"


# ---- constraints: code schema vs frozen schema ------------------------------------------------


def _limits(prop: dict) -> dict:
    """maxLength / maxItems / item maxLength of a property, from OpenAPI or Pydantic form."""
    candidates = [prop, *prop.get("anyOf", [])]
    found: dict = {}
    for c in candidates:
        for key in ("maxLength", "maxItems", "minLength", "pattern"):
            if key in c:
                found[key] = c[key]
        if "items" in c and "maxLength" in c["items"]:
            found["item_maxLength"] = c["items"]["maxLength"]
    return found


def test_update_schema_limits_equal_the_frozen_ones() -> None:
    frozen = load_spec()["components"]["schemas"]["ResumeFieldsUpdate"]["properties"]
    code = ResumeFieldsUpdate.model_json_schema()["properties"]
    assert list(code) == list(frozen)
    for name, prop in frozen.items():
        expected = _limits(prop)
        actual = _limits(code[name])
        # The patterns of phone/email are applied after stripping (G-02): not in the model.
        expected.pop("pattern", None)
        assert actual == expected, name


@pytest.mark.parametrize("entry", ["WorkExperience", "ProjectExperience", "Education"])
def test_entry_schema_limits_equal_the_frozen_ones(entry: str) -> None:
    from app.schemas import resume_fields

    frozen = load_spec()["components"]["schemas"][entry]["properties"]
    code = getattr(resume_fields, entry).model_json_schema()["properties"]
    assert list(code) == list(frozen)
    for name, prop in frozen.items():
        assert _limits(code[name]) == _limits(prop), f"{entry}.{name}"


def test_patterns_in_code_equal_the_frozen_ones() -> None:
    from app.schemas import limits

    frozen = load_spec()["components"]["schemas"]["ResumeFieldsUpdate"]["properties"]
    assert limits.PHONE_PATTERN == frozen["phone"]["pattern"]
    assert limits.EMAIL_PATTERN == frozen["email"]["pattern"]


# ---- constraints: the server enforces them ----------------------------------------------------


def _valid_phone(length: int) -> str:
    return "13800138000" + " " * (length - 11)  # spaces are stripped before the pattern (G-02)


def _valid_email(length: int) -> str:
    tail = "@example.com"
    return "a" * (length - len(tail)) + tail


def _scalar_value(name: str, length: int) -> str:
    if name == "phone":
        return _valid_phone(length)
    if name == "email":
        return _valid_email(length)
    return "x" * length


def _string_cases() -> list[tuple[str, dict, str]]:
    """(id, fields payload, expected field name) for each string maxLength, from the frozen doc."""
    schemas = load_spec()["components"]["schemas"]
    cases = []
    for name, prop in schemas["ResumeFieldsUpdate"]["properties"].items():
        if "maxLength" in prop:
            cases.append((name, name, prop["maxLength"], lambda v, n=name: {n: v}))
        elif prop.get("maxItems") and prop.get("items", {}).get("maxLength"):
            cases.append(
                (f"{name}[item]", name, prop["items"]["maxLength"], lambda v, n=name: {n: [v]})
            )
    for block, entry in (
        ("work_experiences", "WorkExperience"),
        ("project_experiences", "ProjectExperience"),
        ("educations", "Education"),
    ):
        for key, prop in schemas[entry]["properties"].items():
            if "maxLength" in prop:
                cases.append(
                    (
                        f"{block}[0].{key}",
                        block,
                        prop["maxLength"],
                        lambda v, b=block, k=key: {b: [{k: v}]},
                    )
                )
            elif prop.get("items", {}).get("maxLength"):
                cases.append(
                    (
                        f"{block}[0].{key}[item]",
                        block,
                        prop["items"]["maxLength"],
                        lambda v, b=block, k=key: {b: [{k: [v]}]},
                    )
                )
    return [(cid, field, limit, build) for cid, field, limit, build in cases]  # type: ignore[misc]


STRING_CASES = _string_cases()


@pytest.mark.parametrize(
    ("case_id", "field", "limit", "build"), STRING_CASES, ids=[c[0] for c in STRING_CASES]
)
def test_string_length_limit_is_enforced(
    case_id: str, field: str, limit: int, build: Callable, tmp_path: Path
) -> None:
    api = build_api(tmp_path)
    api.upload()
    top = field

    def value(length: int) -> str:
        return _scalar_value(top, length) if case_id == top else "x" * length

    ok = api.client.patch(CURRENT, json={"fields": build(value(limit))})
    assert ok.status_code == 200, (case_id, ok.text)  # exactly the limit is accepted
    assert validate({"$ref": "#/components/schemas/DraftResponse"}, ok.json()) == []

    too_long = api.client.patch(CURRENT, json={"fields": build(value(limit + 1))})
    assert too_long.status_code == 422, case_id
    body = too_long.json()
    assert body["code"] == "validation_failed"
    assert validate({"$ref": "#/components/schemas/ErrorResponse"}, body) == []
    assert [d["reason"] for d in body["details"]] == ["too_long"], (case_id, body)
    assert body["details"][0]["field"].startswith(field)
    assert "x" * 20 not in too_long.text  # the value is never echoed


def _list_cases() -> list[tuple[str, str, int, Callable]]:
    schemas = load_spec()["components"]["schemas"]
    cases = []
    for name, prop in schemas["ResumeFieldsUpdate"]["properties"].items():
        if "maxItems" in prop:
            filler = {} if "$ref" in prop["items"] else "x"
            cases.append((name, name, prop["maxItems"], lambda n, nm=name, f=filler: {nm: [f] * n}))
    for block, entry in (("work_experiences", "WorkExperience"),):
        for key, prop in schemas[entry]["properties"].items():
            if "maxItems" in prop:
                cases.append(
                    (
                        f"{block}[0].{key}",
                        block,
                        prop["maxItems"],
                        lambda n, b=block, k=key: {b: [{k: ["x"] * n}]},
                    )
                )
    return cases


LIST_CASES = _list_cases()


@pytest.mark.parametrize(
    ("case_id", "field", "limit", "build"), LIST_CASES, ids=[c[0] for c in LIST_CASES]
)
def test_list_size_limit_is_enforced(
    case_id: str, field: str, limit: int, build: Callable, tmp_path: Path
) -> None:
    api = build_api(tmp_path)
    api.upload()

    assert api.client.patch(CURRENT, json={"fields": build(limit)}).status_code == 200
    over = api.client.patch(CURRENT, json={"fields": build(limit + 1)})

    assert over.status_code == 422
    body = over.json()
    assert [d["reason"] for d in body["details"]] == ["too_long"], (case_id, body)
    assert body["details"][0]["field"].startswith(field)


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("phone", "12345", "invalid_format"),
        ("phone", "+12345", "invalid_format"),
        ("phone", "138-0013-8000", None),  # hyphens are stripped before the pattern (G-02)
        ("phone", "+85212345678", None),
        ("email", "no-at-sign", "invalid_format"),
        ("email", "a@b", "invalid_format"),
        ("email", "a b@c.com", "invalid_format"),
        ("email", "zhangsan@example.com", None),
        ("name", "   ", "required"),
        ("name", "", "required"),
    ],
)
def test_pattern_and_required_rules_follow_the_frozen_document(
    field: str, value: str, reason: str | None, tmp_path: Path
) -> None:
    api = build_api(tmp_path)
    api.upload()

    response = api.client.patch(CURRENT, json={"fields": {field: value}})

    if reason is None:
        assert response.status_code == 200
        return
    assert response.status_code == 422
    assert response.json()["details"] == [{"field": field, "reason": reason}]
    assert value.strip() == "" or value not in response.text


def test_unknown_field_is_rejected_by_name_only(tmp_path: Path) -> None:
    api = build_api(tmp_path)
    api.upload()
    response = api.client.patch(CURRENT, json={"fields": {"zz_unknown": "ZZ-value"}})
    assert response.status_code == 422
    assert response.json()["details"] == [{"field": "zz_unknown", "reason": "unknown_field"}]
    assert "ZZ-value" not in response.text
