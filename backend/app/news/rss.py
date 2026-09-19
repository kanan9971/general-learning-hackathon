"""Fetch + parse RSS with the stdlib XML parser (no heavy deps on Vercel). Malformed feeds are
skipped, never fatal. Results are cached in-process for 15 minutes."""
import asyncio
import hashlib
import html
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from ..schemas.markets import Headline
from .classify import classify, mentions_company
from .feeds import Feed

TIMEOUT = httpx.Timeout(6.0)
CACHE_SECONDS = 15 * 60
SUMMARY_CHARS = 400
MAX_AGE_HOURS = 96
OFFICIAL_MAX_AGE_HOURS = 21 * 24  # FOMC meets ~every 6 weeks; its releases stay relevant longer

_TAG_RX = re.compile(r"<[^>]+>")
_cache: dict[str, tuple[float, list[Headline] | None]] = {}


def _clean(text: str | None) -> str:
    return " ".join(html.unescape(_TAG_RX.sub(" ", text or "")).split())


def _iso(pub: str | None) -> str | None:
    if not pub:
        return None
    try:
        d = parsedate_to_datetime(pub.strip())
    except (TypeError, ValueError):
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat()


def headline_id(url: str) -> str:
    return "n" + hashlib.sha1(url.encode()).hexdigest()[:12]


def parse_feed(xml_text: str, feed: Feed) -> list[Headline]:
    try:
        root = ET.fromstring(xml_text.lstrip("﻿").strip())
    except ET.ParseError:
        return []
    out = []
    for item in root.iter("item"):
        title = _clean(item.findtext("title"))
        url = (item.findtext("link") or "").strip()
        if not title or not url.startswith("http"):
            continue
        summary = _clean(item.findtext("description"))[:SUMMARY_CHARS]
        if feed.ticker and not mentions_company(title, summary, feed.ticker):
            continue
        sections, tickers, concepts = classify(title, summary, base_sections=feed.sections, ticker=feed.ticker)
        out.append(Headline(
            id=headline_id(url), title=title, summary=summary, url=url, publisher=feed.publisher,
            published_at=_iso(item.findtext("pubDate")), sections=sections, tickers=tickers,  # type: ignore[arg-type]
            concept_ids=concepts, is_official=feed.kind == "fed",
        ))
    return out


def _fresh(h: Headline, now: datetime) -> bool:
    if not h.published_at:
        return True
    age = now - datetime.fromisoformat(h.published_at)
    return age.total_seconds() <= (OFFICIAL_MAX_AGE_HOURS if h.is_official else MAX_AGE_HOURS) * 3600


async def fetch_feeds(feeds: list[Feed], user_agent: str) -> tuple[list[Headline], dict[str, bool]]:
    """Returns (deduped headlines newest-first, {feed url: fetched ok})."""
    now = time.time()
    ok: dict[str, bool] = {}
    todo = []
    results: list[Headline] = []
    for f in feeds:
        hit = _cache.get(f.url)
        if hit and now - hit[0] < CACHE_SECONDS:
            ok[f.url] = hit[1] is not None
            results += hit[1] or []
        else:
            todo.append(f)

    async def one(client: httpx.AsyncClient, f: Feed) -> None:
        try:
            r = await client.get(f.url)
            items = parse_feed(r.text, f) if r.status_code == 200 else None
        except httpx.HTTPError:
            items = None
        _cache[f.url] = (now, items)
        ok[f.url] = items is not None
        results.extend(items or [])

    if todo:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": user_agent}, follow_redirects=True) as c:
            await asyncio.gather(*(one(c, f) for f in todo))

    return dedupe(results), ok


def dedupe(items: list[Headline]) -> list[Headline]:
    """Same URL or same title from several feeds -> one headline with merged tags."""
    now = datetime.now(timezone.utc)
    by_key: dict[str, Headline] = {}
    for h in items:
        if not _fresh(h, now):
            continue
        key = h.title.lower()
        prev = by_key.get(key)
        if prev:
            merged = {
                "sections": list(dict.fromkeys(prev.sections + h.sections)),
                "tickers": list(dict.fromkeys(prev.tickers + h.tickers)),
                "concept_ids": list(dict.fromkeys(prev.concept_ids + h.concept_ids)),
            }
            by_key[key] = prev.model_copy(update=merged)
        else:
            by_key[key] = h
    # Tie-break on id: feeds finish in random order, and callers cache on this ordering.
    return sorted(by_key.values(), key=lambda h: (h.published_at or "", h.id), reverse=True)
