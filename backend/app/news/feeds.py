"""RSS feed registry. Headline + summary + URL + time only; article bodies are never fetched."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Feed:
    url: str
    publisher: str
    kind: str  # fed | wsj | ticker
    sections: tuple[str, ...] = ()  # sections every item from this feed belongs to
    ticker: str | None = None


FED_FEEDS = [
    Feed("https://www.federalreserve.gov/feeds/press_monetary.xml", "Federal Reserve", "fed", ("macro", "rates")),
    Feed("https://www.federalreserve.gov/feeds/speeches.xml", "Federal Reserve", "fed", ("macro",)),
]

# The old feeds.a.dj.com host stopped updating in Jan 2025; current WSJ feeds live on dowjones.io.
DEFAULT_WSJ_FEEDS = [
    "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
    "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed",
    "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness",
    "https://feeds.content.dowjones.io/public/rss/RSSWorldNews",
    "https://feeds.content.dowjones.io/public/rss/RSSWSJD",
]

YAHOO_TICKER_FEED = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US"
MAX_TICKER_FEEDS = 8


def wsj_feeds(configured: str) -> list[Feed]:
    urls = [u.strip() for u in configured.split(",") if u.strip()] or DEFAULT_WSJ_FEEDS
    return [Feed(u, "WSJ", "wsj") for u in urls]


def ticker_feeds(symbols: list[str]) -> list[Feed]:
    return [
        Feed(YAHOO_TICKER_FEED.format(symbol=s), "Yahoo Finance", "ticker", ("companies",), ticker=s)
        for s in symbols[:MAX_TICKER_FEEDS]
    ]
