"""Which instruments each markets section tracks. Symbols are Yahoo chart symbols unless source='treasury'."""
from dataclasses import dataclass

from ..schemas.markets import SectionId


@dataclass(frozen=True)
class Instrument:
    symbol: str
    label: str
    section: SectionId
    asset_class: str
    source: str = "yahoo"  # yahoo | treasury
    level_unit: str = "usd"


# Treasury tenors come from the official Treasury.gov daily par yield curve (no key needed).
TREASURY_TENORS = {"3 Mo": "UST3M", "2 Yr": "UST2Y", "5 Yr": "UST5Y", "10 Yr": "UST10Y", "30 Yr": "UST30Y"}

INSTRUMENTS: list[Instrument] = [
    # Macro: the Fed & economy. Short bills track where the market expects the policy rate to be.
    Instrument("UST3M", "3M T-bill (Fed proxy)", "macro", "yield", "treasury", "%"),
    Instrument("UST2Y", "2Y Treasury (Fed expectations)", "macro", "yield", "treasury", "%"),
    # Rates & bonds
    Instrument("UST5Y", "5Y Treasury", "rates", "yield", "treasury", "%"),
    Instrument("UST10Y", "10Y Treasury", "rates", "yield", "treasury", "%"),
    Instrument("UST30Y", "30Y Treasury", "rates", "yield", "treasury", "%"),
    Instrument("US2S10S", "2s10s curve", "rates", "spread", "treasury", "bp"),
    Instrument("TLT", "Long bond ETF (TLT)", "rates", "stock"),
    # FX
    Instrument("DX-Y.NYB", "US Dollar Index", "fx", "fx", level_unit=""),
    Instrument("EURUSD=X", "EUR/USD", "fx", "fx", level_unit=""),
    Instrument("USDJPY=X", "USD/JPY", "fx", "fx", level_unit=""),
    Instrument("GBPUSD=X", "GBP/USD", "fx", "fx", level_unit=""),
    # Commodities
    Instrument("CL=F", "WTI crude oil", "commodities", "commodity"),
    Instrument("BZ=F", "Brent crude oil", "commodities", "commodity"),
    Instrument("NG=F", "Natural gas", "commodities", "commodity"),
    Instrument("GC=F", "Gold", "commodities", "commodity"),
    Instrument("HG=F", "Copper", "commodities", "commodity"),
    # Equities & volatility (top-down, whole market)
    Instrument("^GSPC", "S&P 500", "equities", "equity_index", level_unit="pts"),
    Instrument("^IXIC", "Nasdaq Composite", "equities", "equity_index", level_unit="pts"),
    Instrument("^DJI", "Dow Jones", "equities", "equity_index", level_unit="pts"),
    Instrument("^RUT", "Russell 2000 (small caps)", "equities", "equity_index", level_unit="pts"),
    Instrument("^VIX", "VIX (fear gauge)", "equities", "vol", level_unit="pts"),
    # Sectors (micro: industry-level rotation)
    Instrument("XLK", "Technology", "sectors", "sector_etf"),
    Instrument("SMH", "Semiconductors", "sectors", "sector_etf"),
    Instrument("XLF", "Financials", "sectors", "sector_etf"),
    Instrument("XLE", "Energy", "sectors", "sector_etf"),
    Instrument("XLV", "Health care", "sectors", "sector_etf"),
    Instrument("XLY", "Consumer discretionary", "sectors", "sector_etf"),
    Instrument("XLP", "Consumer staples", "sectors", "sector_etf"),
    Instrument("XLI", "Industrials", "sectors", "sector_etf"),
    Instrument("XLU", "Utilities", "sectors", "sector_etf"),
    Instrument("XLRE", "Real estate", "sectors", "sector_etf"),
    Instrument("XLC", "Communication services", "sectors", "sector_etf"),
]

# Default single names for company analysis (plus the learner's watchlist and holdings).
COMPANIES: dict[str, tuple[str, str]] = {
    "AAPL": ("Apple", "Technology"),
    "MSFT": ("Microsoft", "Technology"),
    "NVDA": ("Nvidia", "Semiconductors"),
    "AMZN": ("Amazon", "Consumer discretionary"),
    "GOOGL": ("Alphabet", "Communication services"),
    "META": ("Meta Platforms", "Communication services"),
    "TSLA": ("Tesla", "Consumer discretionary"),
    "JPM": ("JPMorgan Chase", "Financials"),
    "GS": ("Goldman Sachs", "Financials"),
    "XOM": ("Exxon Mobil", "Energy"),
    "DAL": ("Delta Air Lines", "Industrials"),
    "TLT": ("iShares 20+Y Treasury ETF", "Bonds"),
    "GLD": ("SPDR Gold ETF", "Gold"),
}
DEFAULT_COMPANIES = ["AAPL", "MSFT", "NVDA", "AMZN", "JPM", "XOM"]

# Words that link a headline to a company (lower-case). Tickers alone are too ambiguous in prose.
COMPANY_ALIASES: dict[str, list[str]] = {
    "AAPL": ["apple", "iphone"], "MSFT": ["microsoft"], "NVDA": ["nvidia"], "AMZN": ["amazon"],
    "GOOGL": ["alphabet", "google"], "META": ["meta platforms", "facebook", "instagram"],
    "TSLA": ["tesla", "elon musk"], "JPM": ["jpmorgan", "jamie dimon"], "GS": ["goldman"],
    "XOM": ["exxon"], "DAL": ["delta air"],
}


def company_name(symbol: str) -> str:
    return COMPANIES.get(symbol, (symbol, "Other"))[0]


def company_sector(symbol: str) -> str:
    return COMPANIES.get(symbol, (symbol, "Other"))[1]


def by_symbol() -> dict[str, Instrument]:
    return {i.symbol: i for i in INSTRUMENTS}
