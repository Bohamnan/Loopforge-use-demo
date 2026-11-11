"""Translate every failure into the unified error body (D-06, B-03)."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.middleware import new_request_id
from app.core.errors import (
    AppError,
    ConfirmationRequiredError,
    FileMissingError,
    InternalError,
    ValidationFailedError,
)
from app.core.logging import log_event, request_id_var
from app.schemas.errors import ErrorDetail, ErrorResponse
from app.services.field_validation import core_issues_from_raw, issues_from_pydantic

# Routes are matched by (method, route template), so session ids never matter.
UPLOAD_ROUTE = ("POST", "/api/v1/sessions")
FIELDS_ROUTE = ("PATCH", "/api/v1/sessions/{session_id}/fields")
MESSAGES_ROUTE = ("POST", "/api/v1/sessions/{session_id}/messages")
CONFIRM_ROUTES = {
    ("POST", "/api/v1/sessions/{session_id}/resume"): "confirmed",
    ("PUT", "/api/v1/sessions/{session_id}/resume"): "confirm_update",
}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or new_request_id()


def _response(request: Request, error: AppError) -> JSONResponse:
    details = [ErrorDetail(field=i.field, reason=i.reason) for i in error.details or []]
    body = ErrorResponse(
        code=error.code,
        message=error.message,
        request_id=_request_id(request),
        details=details or None,
    )
    return JSONResponse(
        body.model_dump(mode="json", exclude_none=True), status_code=error.http_status
    )


def _log(request: Request, error: AppError, exc: BaseException | None = None) -> None:
    token = request_id_var.set(_request_id(request))
    try:
        level = "error" if error.http_status >= 500 else "warning"
        log_event(
            "request_failed", level=level, exc=exc, code=error.code.value,
            status_code=error.http_status,
        )  # fmt: skip
    finally:
        request_id_var.reset(token)


async def _handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    _log(request, exc, exc if exc.http_status >= 500 else None)
    return _response(request, exc)


def _route(request: Request) -> tuple[str, str]:
    """(method, route template); falls back to the raw path when no route matched."""
    template = getattr(request.scope.get("route"), "path", None)
    return request.method, template or request.url.path


def _is_missing_confirmation(errors: list, key: str) -> bool:
    return any(
        e["type"] in {"missing", "bool_type"} and tuple(e["loc"]) in {("body",), ("body", key)}
        for e in errors
    )


def _log_rejected_message(body: object) -> None:
    """Only the length of a rejected message is logged, never its text (B-03)."""
    content = body.get("content") if isinstance(body, dict) else None
    count = len(content) if isinstance(content, str) else None
    log_event("chat_message_rejected", level="warning", count=count)


async def _handle_validation(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = exc.errors()
    route = _route(request)
    error: AppError
    if route == UPLOAD_ROUTE:
        error = FileMissingError()
    elif route in CONFIRM_ROUTES and _is_missing_confirmation(errors, CONFIRM_ROUTES[route]):
        error = ConfirmationRequiredError()
    else:
        issues = issues_from_pydantic(errors)
        if route == FIELDS_ROUTE and isinstance(exc.body, dict):
            # Also report core-field problems (phone/email format ...) found in the raw body,
            # so one response lists everything the user has to fix.
            issues = list(dict.fromkeys(issues + core_issues_from_raw(exc.body.get("fields"))))
        error = ValidationFailedError(issues)
        if route == MESSAGES_ROUTE:
            _log_rejected_message(exc.body)
    _log(request, error)
    return _response(request, error)


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 400 and _route(request) == UPLOAD_ROUTE:
        error: AppError = FileMissingError()  # multipart body could not be parsed
    else:
        error = InternalError()
        error.http_status = exc.status_code  # e.g. 404/405 for unknown routes
    _log(request, error)
    return _response(request, error)


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    error = InternalError()
    _log(request, error, exc)
    return _response(request, error)


def register_error_handlers(app: FastAPI) -> None:
    """Install the handlers on the application."""
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(RequestValidationError, _handle_validation)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(Exception, _handle_unexpected)
