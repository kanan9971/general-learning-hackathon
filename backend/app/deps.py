"""Request dependencies. Auth decisions live here, never in the LLM layer."""
from typing import Annotated

import jwt
from fastapi import Depends, Header

from .config import Settings, get_settings
from .errors import ApiError


def get_user_id(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> str:
    """Verify the Supabase JWT and return the user id (`sub`)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError("unauthorized", "Missing bearer token", 401)
    token = authorization.split(" ", 1)[1]
    if not settings.supabase_jwt_secret:
        raise ApiError("auth_unconfigured", "Server auth is not configured", 503, retryable=True)
    try:
        claims = jwt.decode(
            token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
        )
    except jwt.PyJWTError:
        raise ApiError("unauthorized", "Invalid or expired token", 401)
    return claims["sub"]


CurrentUser = Annotated[str, Depends(get_user_id)]
