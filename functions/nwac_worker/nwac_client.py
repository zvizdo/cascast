"""avalanche.org NAC API client (contract §5.2). No auth."""
from __future__ import annotations

import re
from datetime import datetime
from html import unescape
from zoneinfo import ZoneInfo

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from shared.models import NwacDanger, NwacForecast, NwacProblem

BASE = "https://api.avalanche.org/v2/public"
MAP_LAYER_URL = f"{BASE}/products/map-layer/NWAC"
HEADERS = {
    "User-Agent": "MountainWeatherman/1.0 (mountain-weatherman-app; +https://avalanche.org)",
    "Accept": "application/json",
}
_TIMEOUT = httpx.Timeout(30.0)
_PACIFIC = ZoneInfo("America/Los_Angeles")

# Aspect token -> compass key used in the rose (contract §5.2 aspect list).
_ASPECTS = {
    "north": "N", "northeast": "NE", "east": "E", "southeast": "SE",
    "south": "S", "southwest": "SW", "west": "W", "northwest": "NW",
}
_BANDS = ("lower", "middle", "upper")
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

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


def _sanitize_html(value: str | None) -> str | None:
    """Strip HTML tags + collapse whitespace → plain text (contract §5.2)."""
    if value is None:
        return None
    text = _TAG_RE.sub("", value)
    text = unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _empty_rose() -> dict:
    return {band: {code: False for code in _ASPECTS.values()} for band in _BANDS}


def _aspect_rose(location: list[str] | None) -> dict:
    """Flat ["{aspect} {elevation}"] → {band: {compass: bool}} via rpartition (contract §5.2)."""
    rose = _empty_rose()
    for entry in location or []:
        aspect_word, _, band = entry.lower().rpartition(" ")
        compass = _ASPECTS.get(aspect_word)
        if compass and band in rose:
            rose[band][compass] = True
    return rose


def _danger_for(entries: list[dict], valid_day: str) -> NwacDanger:
    for entry in entries:
        if entry.get("valid_day") == valid_day:
            return NwacDanger(
                upper=_rating(entry.get("upper")),
                middle=_rating(entry.get("middle")),
                lower=_rating(entry.get("lower")),
            )
    return NwacDanger(upper=None, middle=None, lower=None)


def _rating(value) -> int | None:
    """1-5 valid; -1/0/None mean 'no rating' → None (contract §5.2)."""
    if value is None:
        return None
    ivalue = int(value)
    return ivalue if 1 <= ivalue <= 5 else None


def _zone_info(payload: dict, zone_id: str | None) -> tuple[str, str]:
    """Prefer the requested zone — summer products list ALL zones (contract §5.2)."""
    zones = payload.get("forecast_zone") or [{}]
    zone = next((z for z in zones if str(z.get("id")) == zone_id), zones[0])
    return str(zone.get("id", "")), str(zone.get("name", ""))


def _pacific_date(published_time: str | None) -> str:
    """published_time (UTC) → America/Los_Angeles ISO date (contract §3)."""
    if not published_time:
        return ""
    dt = datetime.fromisoformat(str(published_time).replace("Z", "+00:00"))
    return dt.astimezone(_PACIFIC).date().isoformat()


def parse_product(payload: dict, zone_id: str | None = None) -> NwacForecast:
    """Parse a NAC product into the canonical NwacForecast (contract §5.2, §8)."""
    product_type = payload.get("product_type") or ""
    danger_entries = payload.get("danger") or []
    is_summer = product_type != "forecast" or not danger_entries
    parsed_zone_id, zone_name = _zone_info(payload, zone_id)

    problems: list[NwacProblem] = []
    for raw in payload.get("forecast_avalanche_problems") or []:
        size = raw.get("size") or [None, None]
        problems.append(NwacProblem(
            problemId=int(raw.get("avalanche_problem_id")),
            name=raw.get("name") or "",
            likelihood=raw.get("likelihood"),
            sizeMin=str(size[0]) if size and size[0] is not None else None,
            sizeMax=str(size[1]) if len(size) > 1 and size[1] is not None else None,
            aspects=_aspect_rose(raw.get("location")),
            description=_sanitize_html(raw.get("problem_description") or raw.get("discussion")),
        ))

    return NwacForecast(
        zoneId=parsed_zone_id,
        zoneName=zone_name,
        productId=int(payload.get("id")),
        season="summer" if is_summer else "winter",
        productType=product_type,
        publishedTime=payload["published_time"],
        expiresTime=payload["expires_time"],
        forecastDate=_pacific_date(payload.get("published_time")),
        danger={
            "current": _danger_for(danger_entries, "current"),
            "tomorrow": _danger_for(danger_entries, "tomorrow"),
        },
        problems=problems,
        bottomLine=_sanitize_html(payload.get("bottom_line")),
        hazardDiscussion=_sanitize_html(payload.get("hazard_discussion")),
        weatherDiscussion=_sanitize_html(payload.get("weather_discussion")),
    )


@_retry
async def fetch_zone_map() -> dict[str, int]:
    """GET map-layer once → {feature.properties.name: feature.id} (contract §5.2)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(MAP_LAYER_URL)
        resp.raise_for_status()
        data = resp.json()
    return {
        f["properties"]["name"]: int(f["id"])
        for f in data.get("features", [])
        if f.get("properties", {}).get("name")
    }


@_retry
async def fetch_forecast(zone_id: str) -> NwacForecast:
    """GET the per-zone forecast product and parse it (contract §5.2)."""
    params = {"type": "forecast", "center_id": "NWAC", "zone_id": zone_id}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(f"{BASE}/product", params=params)
        resp.raise_for_status()
        payload = resp.json()
    return parse_product(payload, zone_id=zone_id)
