from typing import Literal

from pydantic import BaseModel

DataMode = Literal["live", "cache", "demo"]
Level = Literal["beginner", "intermediate", "advanced"]
Confidence = Literal["low", "medium", "high"]


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool = False


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    data_mode: DataMode
    version: str
    checks: dict[str, bool]
