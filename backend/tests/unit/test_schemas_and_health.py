import json
from pathlib import Path

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.deps import get_user_id
from app.errors import ApiError
from app.main import create_app
from app.schemas import Brief, Challenge, Evaluation, LessonResponse, PortfolioImpactResponse, Progress

FIX = Path(__file__).resolve().parents[2] / "app" / "fixtures"


@pytest.mark.parametrize(
    "name,model",
    [("brief", Brief), ("portfolio_impact", PortfolioImpactResponse), ("challenge", Challenge),
     ("evaluation", Evaluation), ("lesson", LessonResponse), ("progress", Progress)],
)
def test_fixtures_match_schemas(name, model):
    data = json.loads((FIX / f"{name}.json").read_text())
    data.pop("_note", None)
    model.model_validate(data)


def test_health():
    r = TestClient(create_app()).get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_auth_rejects_missing_token():
    with pytest.raises(ApiError) as e:
        get_user_id(None, Settings(supabase_jwt_secret="s", auth_dev_bypass=False))
    assert e.value.status == 401


def test_auth_accepts_valid_and_rejects_bad_token():
    s = Settings(supabase_jwt_secret="secret")
    good = jwt.encode({"sub": "u1", "aud": "authenticated"}, "secret", algorithm="HS256")
    assert get_user_id(f"Bearer {good}", s) == "u1"
    bad = jwt.encode({"sub": "u1", "aud": "authenticated"}, "wrong", algorithm="HS256")
    with pytest.raises(ApiError):
        get_user_id(f"Bearer {bad}", s)


def test_auth_accepts_es256_via_jwks(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import ec

    from app import deps

    key = ec.generate_private_key(ec.SECP256R1())
    good = jwt.encode({"sub": "u2", "aud": "authenticated"}, key, algorithm="ES256", headers={"kid": "k1"})

    monkeypatch.setattr(deps, "_signing_key", lambda url, kid: key.public_key())
    s = Settings(supabase_url="https://x.supabase.co")
    assert get_user_id(f"Bearer {good}", s) == "u2"
    other = ec.generate_private_key(ec.SECP256R1())
    bad = jwt.encode({"sub": "u2", "aud": "authenticated"}, other, algorithm="ES256", headers={"kid": "k1"})
    with pytest.raises(ApiError) as e:
        get_user_id(f"Bearer {bad}", s)
    assert e.value.status == 401


def test_dev_bypass_only_off_vercel():
    from app.deps import DEV_USER_ID

    assert get_user_id(None, Settings(auth_dev_bypass=True, vercel="")) == DEV_USER_ID
    with pytest.raises(ApiError):
        get_user_id(None, Settings(auth_dev_bypass=True, vercel="1"))
