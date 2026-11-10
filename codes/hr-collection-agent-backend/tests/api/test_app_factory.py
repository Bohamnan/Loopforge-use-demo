from fastapi import FastAPI

from app.core.config import Settings
from app.main import create_app


def test_create_app_stores_settings(settings: Settings) -> None:
    app = create_app(settings)
    assert isinstance(app, FastAPI)
    assert app.state.settings is settings


def test_create_app_defaults_to_environment_settings() -> None:
    assert isinstance(create_app().state.settings, Settings)


def test_docs_ui_disabled() -> None:
    app = create_app(Settings(_env_file=None))
    assert app.docs_url is None and app.redoc_url is None
