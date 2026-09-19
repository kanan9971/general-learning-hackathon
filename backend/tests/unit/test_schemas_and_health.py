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
        get_user_id(None, Settings(supabase_jwt_secret="s"))
    assert e.value.status == 401


def test_auth_accepts_valid_and_rejects_bad_token():
    s = Settings(supabase_jwt_secret="secret")
    good = jwt.encode({"sub": "u1", "aud": "authenticated"}, "secret", algorithm="HS256")
    assert get_user_id(f"Bearer {good}", s) == "u1"
    bad = jwt.encode({"sub": "u1", "aud": "authenticated"}, "wrong", algorithm="HS256")
    with pytest.raises(ApiError):
        get_user_id(f"Bearer {bad}", s)
