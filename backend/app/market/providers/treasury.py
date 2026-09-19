"""US Treasury daily par yield curve (official, keyless CSV). Source of the 2Y and the curve."""
import csv
import io
from datetime import date, datetime

import httpx

from ..universe import TREASURY_TENORS
from .base import Quote

CSV_URL = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    "daily-treasury-rates.csv/{year}/all"
)
TIMEOUT = httpx.Timeout(8.0)


def parse_curve_csv(text: str) -> list[tuple[date, dict[str, float]]]:
    """Rows newest-first as (date, {tenor header: yield %}). Blank cells are skipped."""
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            d = datetime.strptime(row["Date"], "%m/%d/%Y").date()
        except (KeyError, ValueError):
            continue
        vals = {k: float(v) for k, v in row.items() if k != "Date" and v not in (None, "")}
        rows.append((d, vals))
    rows.sort(key=lambda r: r[0], reverse=True)
    return rows


def quotes_from_rows(rows: list[tuple[date, dict[str, float]]]) -> dict[str, Quote]:
    """Latest vs prior day (and 5 sessions back) per tenor, plus the 2s10s spread in bp."""
    out: dict[str, Quote] = {}
    if len(rows) < 2:
        return out

    def series(tenor: str) -> list[tuple[date, float]]:
        return [(d, v[tenor]) for d, v in rows if tenor in v]

    for tenor, sym in TREASURY_TENORS.items():
        s = series(tenor)
        if len(s) >= 2:
            out[sym] = Quote(sym, s[0][1], s[1][1], s[5][1] if len(s) > 5 else None, s[0][0].isoformat(), "treasury")

    spread = [(d, round((v["10 Yr"] - v["2 Yr"]) * 100, 1)) for d, v in rows if "10 Yr" in v and "2 Yr" in v]
    if len(spread) >= 2:
        out["US2S10S"] = Quote("US2S10S", spread[0][1], spread[1][1], spread[5][1] if len(spread) > 5 else None,
                               spread[0][0].isoformat(), "treasury")
    return out


async def fetch_curve(user_agent: str, today: date | None = None) -> dict[str, Quote]:
    today = today or date.today()
    params = {"type": "daily_treasury_yield_curve", "field_tdr_date_value": str(today.year), "_format": "csv"}
    rows: list[tuple[date, dict[str, float]]] = []
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": user_agent}, follow_redirects=True) as c:
        for year in (today.year, today.year - 1):  # early January needs last year's tail
            try:
                r = await c.get(CSV_URL.format(year=year), params={**params, "field_tdr_date_value": str(year)})
                if r.status_code == 200:
                    rows += parse_curve_csv(r.text)
            except httpx.HTTPError:
                pass
            if len(rows) >= 6:
                break
    rows.sort(key=lambda r: r[0], reverse=True)
    return quotes_from_rows(rows)
