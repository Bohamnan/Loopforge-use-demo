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
from app.services.field_validation import issues_from_pydantic

UPLOAD_PATH = "/api/v1/resume-drafts"
CONFIRM_PATH = "/api/v1/resumes"


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


def _is_missing_confirmation(errors: list) -> bool:
    return any(
        e["type"] == "missing" and tuple(e["loc"]) in {("body",), ("body", "confirmed")}
        for e in errors
    )


async def _handle_validation(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = exc.errors()
    route = (request.method, request.url.path)
    error: AppError
    if route == ("POST", UPLOAD_PATH):
        error = FileMissingError()
    elif route == ("POST", CONFIRM_PATH) and _is_missing_confirmation(errors):
        error = ConfirmationRequiredError()
    else:
        error = ValidationFailedError(issues_from_pydantic(errors))
    _log(request, error)
    return _response(request, error)


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 400 and (request.method, request.url.path) == ("POST", UPLOAD_PATH):
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
