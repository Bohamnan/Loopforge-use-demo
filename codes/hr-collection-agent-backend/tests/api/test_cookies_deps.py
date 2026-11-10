from fastapi.testclient import TestClient

from app.api import cookies


def _set_cookie(client: TestClient, path: str) -> str:
    return client.get(path).headers["set-cookie"]


def _attrs(header: str) -> set[str]:
    return {p.strip() for p in header.split(";")}


def test_set_cookie_attributes(client: TestClient) -> None:
    header = _set_cookie(client, "/t/set-cookie")
    assert header.startswith("draft_token=tok123;")
    assert _attrs(header) >= {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=604800"}
    assert "Secure" not in _attrs(header)


def test_renew_uses_same_attributes(client: TestClient) -> None:
    assert _attrs(_set_cookie(client, "/t/renew-cookie")) == _attrs(
        _set_cookie(client, "/t/set-cookie")
    )


def test_clear_cookie_expires_immediately(client: TestClient) -> None:
    header = _set_cookie(client, "/t/clear-cookie")
    assert header.startswith("draft_token=;")
    assert _attrs(header) >= {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"}


def test_secure_flag_follows_settings(app, settings) -> None:  # noqa: ANN001
    app.state.settings = settings.model_copy(update={"cookie_secure": True})
    assert "Secure" in _attrs(_set_cookie(TestClient(app), "/t/set-cookie"))


def test_max_age_follows_ttl_setting(app, settings) -> None:  # noqa: ANN001
    app.state.settings = settings.model_copy(update={"draft_ttl_days": 1})
    assert "Max-Age=86400" in _attrs(_set_cookie(TestClient(app), "/t/set-cookie"))


def test_token_is_none_when_cookie_absent(client: TestClient) -> None:
    assert client.get("/t/token").json() == {"token": None}


def test_token_is_read_from_cookie(client: TestClient) -> None:
    client.cookies.set(cookies.COOKIE_NAME, "abc")
    assert client.get("/t/token").json() == {"token": "abc"}


def test_empty_cookie_treated_as_absent(client: TestClient) -> None:
    client.cookies.set(cookies.COOKIE_NAME, "")
    assert client.get("/t/token").json() == {"token": None}
