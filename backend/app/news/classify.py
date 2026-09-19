"""Deterministic headline tagging: which market sections and concepts a headline is about.
Keyword rules, matched on whole words in the title + RSS summary. Cheap and explainable."""
import re

from ..market.universe import COMPANY_ALIASES

SECTION_KEYWORDS: dict[str, list[str]] = {
    "macro": [
        "fed", "federal reserve", "fomc", "powell", "central bank", "interest rate", "rate cut", "rate cuts",
        "rate hike", "inflation", "cpi", "pce", "jobs report", "payrolls", "unemployment", "jobless", "gdp",
        "recession", "economy", "economic", "tariff", "tariffs", "consumer spending", "retail sales",
        "ecb", "bank of japan", "bank of england", "stimulus", "deficit", "treasury secretary",
    ],
    "rates": [
        "treasury", "treasuries", "yield", "yields", "bond", "bonds", "10-year", "two-year", "2-year",
        "yield curve", "mortgage rates", "debt auction", "credit spreads",
    ],
    "fx": [
        "the dollar", "u.s. dollar", "dollar index", "greenback", "currency", "currencies", "yen", "euro",
        "sterling", "yuan", "forex", "exchange rate",
    ],
    "commodities": [
        "oil", "crude", "opec", "brent", "natural gas", "gasoline", "gold", "silver", "copper",
        "commodity", "commodities", "wheat", "lng",
    ],
    "equities": [
        "stocks", "stock market", "s&p 500", "s&p", "nasdaq", "dow", "wall street", "rally", "selloff",
        "sell-off", "bull market", "bear market", "volatility", "vix", "russell 2000", "small caps",
    ],
    "sectors": [
        "banks", "bank stocks", "chip", "chips", "chipmakers", "semiconductor", "semiconductors", "tech stocks",
        "energy stocks", "airlines", "retailers", "automakers", "utilities", "real estate", "homebuilders",
        "pharma", "biotech", "health insurers", "defense stocks", "ai stocks",
    ],
    "companies": [
        "earnings", "quarterly results", "revenue", "profit", "guidance", "ceo", "merger",
        "acquisition", "acquire", "ipo", "buyback", "layoffs",
    ],
}

CONCEPT_KEYWORDS: dict[str, list[str]] = {
    "rate-expectations": ["fed", "fomc", "rate cut", "rate cuts", "rate hike", "powell", "dot plot"],
    "cpi-surprise": ["inflation", "cpi", "consumer prices", "pce"],
    "yield-curve": ["yield curve", "inverted", "steepen", "flatten"],
    "bond-price-yield": ["treasury", "treasuries", "bond", "bonds", "yield", "yields"],
    "usd-rate-differentials": ["the dollar", "dollar index", "greenback", "yen", "euro", "currency"],
    "oil-drivers": ["oil", "crude", "opec", "brent"],
    "gold-real-yields": ["gold"],
    "risk-on-off": ["selloff", "sell-off", "rally", "risk", "safe haven", "haven"],
    "vix": ["volatility", "vix"],
    "earnings-vs-guidance": ["earnings", "guidance", "outlook", "quarterly results", "forecast"],
    "sector-rotation": ["rotation", "sector", "sectors", "banks", "chipmakers", "semiconductor"],
    "discount-rates-equities": ["valuation", "valuations"],
}


def _compile(words: list[str]) -> re.Pattern:
    return re.compile(r"\b(" + "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True)) + r")\b")


_SECTION_RX = {k: _compile(v) for k, v in SECTION_KEYWORDS.items()}
_CONCEPT_RX = {k: _compile(v) for k, v in CONCEPT_KEYWORDS.items()}
_COMPANY_RX = {sym: _compile(aliases) for sym, aliases in COMPANY_ALIASES.items()}


def classify(title: str, summary: str, *, base_sections: tuple[str, ...] = (), ticker: str | None = None
             ) -> tuple[list[str], list[str], list[str]]:
    """Returns (sections, tickers, concept_ids)."""
    text = f"{title} {summary}".lower()
    sections = list(base_sections)
    sections += [s for s, rx in _SECTION_RX.items() if s not in sections and rx.search(text)]
    tickers = [ticker] if ticker else []
    tickers += [sym for sym, rx in _COMPANY_RX.items() if sym not in tickers and rx.search(text)]
    if tickers and "companies" not in sections:
        sections.append("companies")
    concepts = [c for c, rx in _CONCEPT_RX.items() if rx.search(text)]
    return sections, tickers, concepts


def mentions_company(title: str, summary: str, ticker: str) -> bool:
    """Per-ticker Yahoo feeds carry unrelated items and ads; keep only ones that name the company."""
    text = f"{title} {summary}"
    if re.search(rf"\b{re.escape(ticker)}\b", text):
        return True
    rx = _COMPANY_RX.get(ticker)
    return bool(rx and rx.search(text.lower()))
