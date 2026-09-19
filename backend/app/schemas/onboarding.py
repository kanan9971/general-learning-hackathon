from typing import Literal

from pydantic import BaseModel

from .common import Level


class OnboardingRequest(BaseModel):
    level: Level
    background: str
    goal: Literal["st_prep", "investing", "both"]
    target_desk: Literal["macro", "rates", "equities", "fx", "general"]
    asset_prefs: list[str] = []
    daily_minutes: int = 10
    use_demo_portfolio: bool = True


class Profile(OnboardingRequest):
    user_id: str
