"""Copernicus / Sentinel-2 client (contract §5.4, spec A5)."""
from __future__ import annotations

import time
from datetime import date, timedelta

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from shared.config import require_env

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
SEARCH_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
IMAGE_SIZE = 512
# True-color (B04/B03/B02) with a fixed 2.5 gain — matches the live-verified curl.
TRUE_COLOR_EVALSCRIPT = (
    "//VERSION=3\n"
    'function setup(){return{input:["B02","B03","B04"],output:{bands:3}};}\n'
    "function evaluatePixel(s){return [2.5*s.B04, 2.5*s.B03, 2.5*s.B02];}"
)
EOX_TEMPLATE = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
EOX_ATTRIBUTION = (
    "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH "
    "(Contains modified Copernicus Sentinel data)"
)
BBOX_DELTA = 0.08          # degrees (~±9 km)
CLOUD_THRESHOLD = 70       # eo:cloud_cover < 70 (contract §5.4, applied client-side)
SEARCH_LIMIT = 10          # page size; results arrive newest-first, filtered client-side
WINDOW_DAYS = 35           # trailing backfill window (matches 35-day retention)
WINDOW_SEARCH_LIMIT = 40   # page size for the windowed backfill search (Sentinel-2 revisit ~5d)
TOKEN_SKEW = 60            # refresh this many seconds before exp
HEADERS = {"User-Agent": "MountainWeatherman/1.0 (mountain-weatherman-app)"}
_TIMEOUT = httpx.Timeout(30.0)

# Module-level token cache: (access_token, monotonic_expiry).
_token_cache: tuple[str, float] | None = None

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


def _reset_token_cache() -> None:  # test helper
    global _token_cache
    _token_cache = None


def bbox_for(lat: float, lng: float) -> dict:
    return {
        "west": lng - BBOX_DELTA,
        "east": lng + BBOX_DELTA,
        "south": lat - BBOX_DELTA,
        "north": lat + BBOX_DELTA,
    }


def eox_tile_template() -> str:
    return EOX_TEMPLATE


@_retry
async def get_token() -> str:
    """OAuth2 client-credentials token, cached until exp (contract §5.4)."""
    global _token_cache
    if _token_cache is not None and _token_cache[1] > time.monotonic():
        return _token_cache[0]
    data = {
        "grant_type": "client_credentials",
        "client_id": require_env("CDSE_CLIENT_ID"),
        "client_secret": require_env("CDSE_CLIENT_SECRET"),
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.post(TOKEN_URL, data=data)
        resp.raise_for_status()
        body = resp.json()
    token = body["access_token"]
    expiry = time.monotonic() + max(body.get("expires_in", 600) - TOKEN_SKEW, 0)
    _token_cache = (token, expiry)
    return token


def parse_scenes(payload: dict) -> list[dict]:
    """All features under the cloud threshold, newest-first (CDSE returns descending
    datetime; cloud filter applied client-side — server-side filters return HTTP 400)."""
    scenes: list[dict] = []
    for feature in payload.get("features") or []:
        props = feature.get("properties", {})
        cloud = props.get("eo:cloud_cover")
        if cloud is not None and cloud >= CLOUD_THRESHOLD:
            continue
        dt = props.get("datetime", "")
        scenes.append({
            "sceneId": feature.get("id", ""),
            "latestImageDate": dt[:10],
            "cloudCoverPercent": cloud,
        })
    return scenes


def parse_search(payload: dict) -> dict | None:
    """Newest feature under the cloud threshold (the latest scene), else None."""
    scenes = parse_scenes(payload)
    return scenes[0] if scenes else None


def _search_body(bbox: dict, start: str = "2015-06-23", limit: int = SEARCH_LIMIT) -> dict:
    return {
        "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
        "datetime": f"{start}T00:00:00Z/..",
        "collections": ["sentinel-2-l2a"],
        "limit": limit,
    }


@_retry
async def search_latest_scene(bbox: dict) -> dict | None:
    token = await get_token()
    headers = {**HEADERS, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(SEARCH_URL, headers=headers, json=_search_body(bbox))
        resp.raise_for_status()
        payload = resp.json()
    return parse_search(payload)


@_retry
async def search_recent_scenes(bbox: dict) -> list[dict]:
    """All <70%-cloud scenes in the trailing WINDOW_DAYS (newest-first) — drives backfill."""
    start = (date.today() - timedelta(days=WINDOW_DAYS)).isoformat()
    token = await get_token()
    headers = {**HEADERS, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(SEARCH_URL, headers=headers, json=_search_body(bbox, start=start, limit=WINDOW_SEARCH_LIMIT))
        resp.raise_for_status()
        payload = resp.json()
    return parse_scenes(payload)


def _process_body(bbox: dict, date: str) -> dict:
    return {
        "input": {
            "bounds": {
                "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {"timeRange": {"from": f"{date}T00:00:00Z", "to": f"{date}T23:59:59Z"}},
            }],
        },
        "output": {
            "width": IMAGE_SIZE, "height": IMAGE_SIZE,
            "responses": [{"identifier": "default", "format": {"type": "image/jpeg"}}],
        },
        "evalscript": TRUE_COLOR_EVALSCRIPT,
    }


@_retry
async def render_scene_image(bbox: dict, date: str) -> bytes:
    """Render a true-color JPEG of the bbox for the given scene date (contract §5.4)."""
    token = await get_token()
    headers = {**HEADERS, "Authorization": f"Bearer {token}",
               "Content-Type": "application/json", "Accept": "image/jpeg"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(PROCESS_URL, headers=headers, json=_process_body(bbox, date))
        resp.raise_for_status()
        ct = resp.headers.get("content-type", "")
        if not ct.startswith("image/"):
            raise ValueError(f"Processing API returned non-image content-type: {ct!r}")
        return resp.content
