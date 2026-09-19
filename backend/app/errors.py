"""Typed API errors: every failure is {code, message, retryable}."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, retryable: bool = False):
        self.code, self.message, self.status, self.retryable = code, message, status, retryable


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content={"code": exc.code, "message": exc.message, "retryable": exc.retryable},
        )
