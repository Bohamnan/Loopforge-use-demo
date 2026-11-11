import pytest
from fastapi.testclient import TestClient

from app.api import cookies
from tests.api.conftest import BROWSER_ID


def _attrs(header: str) -> set[str]:
    return {p.strip() for p in header.split(";")}


def test_cookie_attributes_fixed_and_renew_identical(client: TestClient) -> None:
    issued = client.get("/t/issue-cookie").headers["set-cookie"]
    assert issued.startswith(f"browser_id={BROWSER_ID};")
    assert _attrs(issued) >= {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=34560000"}
    assert "Secure" not in _attrs(issued)
    assert _attrs(client.get("/t/renew-cookie").headers["set-cookie"]) == _attrs(issued)


def test_no_clear_function() -> None:
    assert not hasattr(cookies, "clear")  # saving must never make other sessions unreachable


def test_secure_flag_follows_settings(app, settings) -> None:  # noqa: ANN001
    app.state.settings = settings.model_copy(update={"cookie_secure": True})
    header = TestClient(app).get("/t/issue-cookie").headers["set-cookie"]
    assert "Secure" in _attrs(header)


def test_valid_cookie_is_read(client: TestClient) -> None:
    client.cookies.set(cookies.COOKIE_NAME, BROWSER_ID)
    assert client.get("/t/browser-id").json() == {"browser_id": BROWSER_ID}


@pytest.mark.parametrize("value", [None, "", "short", "A" * 42, "A" * 44, "A" * 42 + "+"])
def test_absent_or_malformed_cookie_means_no_identifier(client: TestClient, value) -> None:  # noqa: ANN001
    if value is not None:
        client.cookies.set(cookies.COOKIE_NAME, value)
    assert client.get("/t/browser-id").json() == {"browser_id": None}
