"""Application factory. Wires middleware and error handlers; contains no business logic."""

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.middleware import RequestIdMiddleware
from app.core.config import Settings
from app.core.logging import configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the FastAPI application. Routers and lifespan are attached by later slices."""
    configure_logging()
    app = FastAPI(title="hr-collection-agent", version="0.1.1", docs_url=None, redoc_url=None)
    app.state.settings = settings or Settings()
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)
    return app
