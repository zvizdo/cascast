"""NRCS AWDB REST API client (contract §5.3). No auth."""
from __future__ import annotations

from datetime import date, timedelta

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from shared.models import SnotelData, SnotelReading

BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
ELEMENTS = ["WTEQ", "SNWD", "TMAX", "TMIN", "PREC"]
WINDOW_DAYS = 35
HEADERS = {
    "User-Agent": "MountainWeatherman/1.0 (mountain-weatherman-app)",
    "Accept": "application/json",
}
_TIMEOUT = httpx.Timeout(45.0)  # gov servers can be slow

def _is_transient(e: BaseException) -> bool:
    """Retry only transient failures — transport errors, timeouts, 5xx (not 4xx)."""
    if isinstance(e, (httpx.TransportError, httpx.TimeoutException)):
        return True
    return isinstance(e, httpx.HTTPStatusError) and e.response.status_code >= 500


_retry = retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2),
    reraise=True,
)


def _index_by_date(values: list[dict]) -> dict[str, dict]:
    """{date: {"value":..., "median":...}} (contract §5.3 — align by date, not zip)."""
    return {
        v["date"]: {"value": v.get("value"), "median": v.get("median")}
        for v in values
    }


def _percent_of_median(swe: float | None, median: float | None) -> float | None:
    if swe is None or not median:  # guards None and 0 (contract §5.3)
        return None
    return swe / median * 100


def _element_map(station_data: dict) -> dict[str, dict[str, dict]]:
    out: dict[str, dict[str, dict]] = {}
    for series in station_data.get("data", []):
        code = series["stationElement"]["elementCode"]
        out[code] = _index_by_date(series.get("values", []))
    return out


def _all_dates(elements: dict[str, dict[str, dict]]) -> list[str]:
    dates: set[str] = set()
    for series in elements.values():
        dates.update(series.keys())
    return sorted(dates)


def _daily_precip(prec_values: dict[str, float | None], day: str, prev_day: str | None) -> float | None:
    """Diff cumulative PREC vs the prior available day (contract §5.3)."""
    today = prec_values.get(day)
    if today is None or prev_day is None:
        return None
    prior = prec_values.get(prev_day)
    if prior is None:
        return None
    return round(today - prior, 2)


def parse_stations(stations: list[dict]) -> dict[str, dict]:
    """Stations response → {triplet: {name, elevationFt, lat, lng}} (contract §5.3)."""
    return {
        s["stationTriplet"]: {
            "name": s.get("name", ""),
            "elevationFt": float(s.get("elevation", 0) or 0),
            "lat": float(s.get("latitude", 0) or 0),
            "lng": float(s.get("longitude", 0) or 0),
        }
        for s in stations
    }


def parse_data(data: list[dict], station_id: str, station: dict) -> SnotelData:
    """Build current + 30-day trend, aligned by date (contract §5.3, §8)."""
    station_data = data[0] if data else {"stationTriplet": "", "data": []}
    triplet = station_data.get("stationTriplet", "")
    elements = _element_map(station_data)
    dates = _all_dates(elements)

    wteq = elements.get("WTEQ", {})
    snwd = elements.get("SNWD", {})
    tmax = elements.get("TMAX", {})
    tmin = elements.get("TMIN", {})
    prec_idx = {d: v["value"] for d, v in elements.get("PREC", {}).items()}

    trend: list[SnotelReading] = []
    for d in dates:
        trend.append(SnotelReading(
            date=d,
            snowDepthIn=snwd.get(d, {}).get("value"),
            sweIn=wteq.get(d, {}).get("value"),
        ))

    # current = latest date with any WTEQ/SNWD reading, else latest date overall
    current_date = next(
        (d for d in reversed(dates)
         if wteq.get(d, {}).get("value") is not None or snwd.get(d, {}).get("value") is not None),
        dates[-1] if dates else "",
    )
    idx = dates.index(current_date) if current_date in dates else -1
    prev_date = dates[idx - 1] if idx > 0 else None

    swe = wteq.get(current_date, {}).get("value")
    median = wteq.get(current_date, {}).get("median")
    current = SnotelReading(
        date=current_date,
        snowDepthIn=snwd.get(current_date, {}).get("value"),
        sweIn=swe,
        sweMedianIn=median,
        percentOfMedian=_percent_of_median(swe, median),
        tempMaxF=tmax.get(current_date, {}).get("value"),
        tempMinF=tmin.get(current_date, {}).get("value"),
        precipAccumIn=_daily_precip(prec_idx, current_date, prev_date),
    )

    return SnotelData(
        stationId=station_id,
        stationTriplet=triplet or f"{station_id}:WA:SNTL",
        stationName=station.get("name", ""),
        elevationFt=station.get("elevationFt", 0.0),
        lat=station.get("lat", 0.0),
        lng=station.get("lng", 0.0),
        current=current,
        trend=trend,
    )


def _window() -> tuple[str, str]:
    end = date.today()
    begin = end - timedelta(days=WINDOW_DAYS)
    return begin.isoformat(), end.isoformat()


@_retry
async def fetch_data(station_id: str, triplet: str) -> list[dict]:
    begin, end = _window()
    params = {
        "stationTriplets": triplet,
        "elements": ",".join(ELEMENTS),
        "duration": "DAILY",
        "beginDate": begin,
        "endDate": end,
        "centralTendencyType": "MEDIAN",
        "returnFlags": "false",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(f"{BASE}/data", params=params)
        resp.raise_for_status()
        body = resp.json()
    return body["data"] if isinstance(body, dict) and "data" in body else body


@_retry
async def fetch_station(triplet: str) -> dict:
    params = {"stationTriplets": triplet, "activeOnly": "true"}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(f"{BASE}/stations", params=params)
        resp.raise_for_status()
        body = resp.json()
    stations = body["stations"] if isinstance(body, dict) and "stations" in body else body
    return parse_stations(stations).get(triplet, {"name": "", "elevationFt": 0.0, "lat": 0.0, "lng": 0.0})
