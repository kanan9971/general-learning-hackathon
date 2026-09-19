"""Request dependencies. Auth decisions live here, never in the LLM layer."""
import time
from typing import Annotated

import httpx
import jwt
from fastapi import Depends, Header
from jwt import PyJWKSet

from .config import Settings, get_settings
from .errors import ApiError


_JWKS_CACHE: dict[str, tuple[float, PyJWKSet]] = {}
_JWKS_TTL = 3600


def _jwks(url: str, refresh: bool = False) -> PyJWKSet:
    """Fetch signing keys with httpx (system CA bundle issues break urllib on some Pythons)."""
    hit = _JWKS_CACHE.get(url)
    if hit and not refresh and time.time() - hit[0] < _JWKS_TTL:
        return hit[1]
    try:
        data = httpx.get(url, timeout=5).raise_for_status().json()
    except httpx.HTTPError as e:
        raise ApiError("auth_unavailable", "Could not fetch signing keys", 503, retryable=True) from e
    keys = PyJWKSet.from_dict(data)
    _JWKS_CACHE[url] = (time.time(), keys)
    return keys


def _signing_key(url: str, kid: str | None):
    for refresh in (False, True):  # second pass handles key rotation (unknown kid)
        for k in _jwks(url, refresh).keys:
            if k.key_id == kid:
                return k.key
    raise jwt.InvalidKeyError("unknown signing key id")


def _decode(token: str, settings: Settings) -> dict:
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":  # legacy shared-secret projects
        if not settings.supabase_jwt_secret:
            raise ApiError("auth_unconfigured", "HS256 token but no JWT secret configured", 503, True)
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    if alg in ("ES256", "RS256"):  # Supabase asymmetric signing keys
        if not settings.supabase_url:
            raise ApiError("auth_unconfigured", "SUPABASE_URL not configured", 503, True)
        kid = jwt.get_unverified_header(token).get("kid")
        key = _signing_key(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", kid)
        return jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    raise jwt.InvalidAlgorithmError(f"unsupported alg {alg}")


DEV_USER_ID = "00000000-0000-0000-0000-000000000000"


def get_user_id(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> str:
    """Verify the Supabase JWT and return the user id (`sub`)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        if settings.auth_dev_bypass and not settings.vercel:
            return DEV_USER_ID
        raise ApiError("unauthorized", "Missing bearer token", 401)
    token = authorization.split(" ", 1)[1]
    try:
        return _decode(token, settings)["sub"]
    except ApiError:
        raise
    except (jwt.PyJWTError, KeyError):
        raise ApiError("unauthorized", "Invalid or expired token", 401)


CurrentUser = Annotated[str, Depends(get_user_id)]
