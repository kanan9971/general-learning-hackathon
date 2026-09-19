"""Supabase client factories. Service-role client is for cron/ingest ONLY (bypasses RLS)."""
from supabase import Client, create_client

from ..config import get_settings


def service_client() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def user_client(access_token: str) -> Client:
    """Client scoped to the caller's JWT so RLS enforces ownership on user tables."""
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client
