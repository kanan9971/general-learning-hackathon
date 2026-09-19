from fastapi import APIRouter, Depends

from ..config import Settings, get_settings
from ..schemas.common import Health

router = APIRouter()


@router.get("/health", response_model=Health)
def health(settings: Settings = Depends(get_settings)) -> Health:
    # Phase 0: config presence only. Real DB/provider pings come with their modules.
    checks = {
        "supabase_configured": bool(settings.supabase_url),
        "llm_configured": bool(settings.xai_api_key),
        "embeddings_configured": bool(settings.embedding_api_key),
    }
    return Health(
        status="ok", data_mode=settings.data_mode, version=settings.app_version, checks=checks
    )
