"""Serve canned P0 responses so the mobile app can build before real routes exist.
Enabled only when DEV_FIXTURES=true. Remove once real routes replace them."""
import json
from pathlib import Path

from fastapi import APIRouter

from ..errors import ApiError

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
router = APIRouter(prefix="/v1/dev/fixtures")


@router.get("/{name}")
def get_fixture(name: str):
    path = FIXTURE_DIR / f"{name}.json"
    if not name.isidentifier() or not path.is_file():
        raise ApiError("not_found", f"No fixture '{name}'", 404)
    return json.loads(path.read_text())
