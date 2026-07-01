import asyncio
import os
import random

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)

from shared.models import ModelSeries

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
METERS_TO_FEET = 3.28084

# Open-Meteo model ids (contract §5.1)
HRRR = "gfs_hrrr"
GFS = "gfs_seamless"
ECMWF = "ecmwf_ifs025"

# Surface hourly vars (contract §5.1)
HOURLY_VARS = [
    "temperature_2m", "apparent_temperature", "wind_speed_10m", "wind_gusts_10m",
    "wind_direction_10m", "precipitation", "precipitation_probability", "snowfall",
    "freezing_level_height", "cloud_cover", "visibility", "weather_code",
]

# Candidate pressure levels for per-mountain band selection (C1). Each band
# (base/mid/summit) is mapped to the level whose geopotential height is nearest
# that band's actual elevation — so a 14k-ft summit reads its true level, not a
# fixed 700 hPa (~10k ft). Request both temperature AND geopotential height per
# level so the worker can resolve heights at parse time.
CANDIDATE_HPA = ["925", "850", "700", "600", "500", "400"]
BAND_FIELDS = {"base": "temp_base_f", "mid": "temp_mid_f", "summit": "temp_summit_f"}
PRESSURE_VARS = (
    [f"temperature_{lvl}hPa" for lvl in CANDIDATE_HPA]
    + [f"geopotential_height_{lvl}hPa" for lvl in CANDIDATE_HPA]
)

ALL_HOURLY = HOURLY_VARS + PRESSURE_VARS

# Thundering-herd controls. The orchestrator fans the weather refresh out to ALL
# mountains in the same minute and each worker makes 2 concurrent Open-Meteo calls,
# so a large catalog (50+) bursts the public API and trips its concurrency/rate
# limits (HTTP 400 "Too many concurrent requests" / HTTP 429). We (a) spread each
# worker's first call with random startup jitter and (b) retry only those TRANSIENT
# throttles with exponential backoff + jitter; deterministic 4xx bodies (bad params)
# stay non-retryable. All knobs are env-tunable so the pipeline can scale without
# code changes.
#
# Worst-case wall-clock must stay under the 120s worker timeout (Terraform):
#   JITTER (10) + RETRY_MAX_ATTEMPTS*REQUEST_TIMEOUT (4*20) + (n-1)*RETRY_WAIT (3*8)
#   = 10 + 80 + 24 = 114s < 120s, even if every attempt stalls to its full timeout.
JITTER_SECONDS = float(os.environ.get("WEATHER_FETCH_JITTER_SECONDS", "10"))
RETRY_MAX_ATTEMPTS = int(os.environ.get("WEATHER_FETCH_RETRY_ATTEMPTS", "4"))
RETRY_WAIT_MAX_SECONDS = float(os.environ.get("WEATHER_FETCH_RETRY_WAIT_MAX", "8"))
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("WEATHER_FETCH_TIMEOUT", "20"))

# Substrings (case-insensitive) in Open-Meteo's {reason} that mark a transient
# throttle rather than a deterministic bad request.
_THROTTLE_MARKERS = ("too many concurrent requests", "limit exceeded")


class OpenMeteoError(RuntimeError):
    """Raised when Open-Meteo returns an error body (HTTP 400 {error, reason})."""


class OpenMeteoThrottled(OpenMeteoError):
    """Transient throttle: HTTP 429, or HTTP 400 'Too many concurrent requests'.
    Safe to retry with backoff — distinct from a deterministic bad-params 400."""


def _params(mountain: dict, models: tuple[str, ...]) -> dict:
    return {
        "latitude": mountain["lat"],
        "longitude": mountain["lng"],
        "hourly": ",".join(ALL_HOURLY),
        "models": ",".join(models),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": mountain["timezone"],
        "forecast_days": 7,
    }


def _is_throttle(status_code: int, reason: str) -> bool:
    """A transient throttle: HTTP 429, or a 400 whose reason marks a concurrency/
    rate limit. Distinguished from deterministic 4xx (bad params) so only throttles
    are retried."""
    if status_code == 429:
        return True
    low = reason.lower()
    return any(marker in low for marker in _THROTTLE_MARKERS)


async def _request(client: httpx.AsyncClient, mountain: dict, models: tuple[str, ...]) -> dict:
    """One Open-Meteo call. 5xx -> httpx.HTTPStatusError (retryable). Throttle (429 /
    "too many concurrent requests") -> OpenMeteoThrottled (retryable). Other 4xx /
    {error} bodies -> OpenMeteoError (NOT retryable). Otherwise the parsed body."""
    resp = await client.get(FORECAST_URL, params=_params(mountain, models))
    if resp.status_code >= 500:
        resp.raise_for_status()  # 5xx -> httpx.HTTPStatusError -> retried
    body = resp.json()
    # Open-Meteo signals errors with HTTP 400 AND {"error": true, "reason": "..."}
    reason = body.get("reason", f"HTTP {resp.status_code}") if isinstance(body, dict) \
        else f"HTTP {resp.status_code}"
    if _is_throttle(resp.status_code, reason):
        raise OpenMeteoThrottled(reason)
    if resp.status_code >= 400 or (isinstance(body, dict) and body.get("error")):
        raise OpenMeteoError(reason)
    return body


async def _get(client: httpx.AsyncClient, mountain: dict, models: tuple[str, ...]) -> dict:
    """_request with retry: transient transport/5xx/throttle errors (and a hard
    per-attempt timeout) back off and retry (exponential + jitter); a deterministic
    4xx body raises on the first try.

    asyncio.wait_for caps each attempt at REQUEST_TIMEOUT_SECONDS regardless of
    httpx's per-phase (connect/read/write/pool) timeout semantics, so the documented
    worst-case wall-clock budget holds even if an attempt stalls."""
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(RETRY_MAX_ATTEMPTS),
        wait=wait_random_exponential(multiplier=1, max=RETRY_WAIT_MAX_SECONDS),
        retry=retry_if_exception_type((httpx.HTTPError, OpenMeteoThrottled, asyncio.TimeoutError)),
        reraise=True,
    ):
        with attempt:
            return await asyncio.wait_for(
                _request(client, mountain, models), REQUEST_TIMEOUT_SECONDS
            )


def _suffix(model: str, multi: bool) -> str:
    """Key suffix: '_<model>' when ≥2 models requested, '' for a single model."""
    return f"_{model}" if multi else ""


def _in_meters(units: dict, var: str, sfx: str) -> bool:
    """Detect whether a height var is reported in meters for this model.

    Open-Meteo returns heights (freezing level, geopotential) in feet under
    imperial params (unit == "ft") but in meters for plain requests. Multi-model
    responses suffix the unit keys too (`{var}_{model}`), so we check the suffixed
    key first, fall back to the unsuffixed key, then default to meters.
    """
    unit = units.get(f"{var}{sfx}") or units.get(var, "m")
    return str(unit).lower().startswith("m")


def _select_band_temps(hourly: dict, units: dict, sfx: str, elevations: dict) -> dict:
    """Pick, per band, the candidate pressure level whose representative geopotential
    height is nearest the band's elevation; return {temp_*_f: that level's temp series}.

    A level whose geopotential series is entirely null (or absent) for this model is
    excluded. Representative height = mean of non-null geopotential values (ft).
    """
    level_heights: dict[str, float] = {}
    for lvl in CANDIDATE_HPA:
        geo = hourly.get(f"geopotential_height_{lvl}hPa{sfx}")
        if not geo:
            continue
        if _in_meters(units, f"geopotential_height_{lvl}hPa", sfx):
            geo = [None if v is None else v * METERS_TO_FEET for v in geo]
        present = [v for v in geo if v is not None]
        if not present:
            continue
        level_heights[lvl] = sum(present) / len(present)

    out: dict = {}
    for band, field in BAND_FIELDS.items():
        if not level_heights:
            out[field] = []
            continue
        target = elevations[band]
        best = min(level_heights, key=lambda lvl: abs(level_heights[lvl] - target))
        out[field] = hourly.get(f"temperature_{best}hPa{sfx}", [])
    return out


def parse_models(
    body: dict, models: tuple[str, ...], elevations: dict
) -> dict[str, ModelSeries]:
    """Split a (possibly multi-model) Open-Meteo body into one ModelSeries per model.
    Surface vars are copied as-is; pressure-level band temps are resolved per-mountain
    by nearest geopotential height into temp_base/mid/summit_f (see _select_band_temps).

    Canonical storage is imperial (feet). Open-Meteo returns freezing_level_height
    in feet when imperial units are requested (hourly_units == "ft"), but in meters
    for plain requests — so we convert m→ft ONLY when the reported unit is meters.
    NOTE: in multi-model responses the unit keys are ALSO model-suffixed
    (`freezing_level_height_gfs_seamless`), so we look up the suffixed unit per model
    and fall back to the unsuffixed key, then default to meters.
    """
    hourly = body["hourly"]
    time = hourly["time"]
    units = body.get("hourly_units", {})
    multi = len(models) >= 2
    out: dict[str, ModelSeries] = {}
    for model in models:
        sfx = _suffix(model, multi)
        fl_in_meters = _in_meters(units, "freezing_level_height", sfx)
        data: dict = {"available": True, "time": time}
        for var in HOURLY_VARS:
            values = hourly.get(f"{var}{sfx}", [])
            if var == "freezing_level_height" and fl_in_meters:
                values = [None if v is None else v * METERS_TO_FEET for v in values]
            data[var] = values
        data.update(_select_band_temps(hourly, units, sfx, elevations))
        out[model] = ModelSeries.model_validate(data)
    return out


async def _apply_jitter() -> None:
    """Sleep a random 0..JITTER_SECONDS before the first API call so a fan-out to
    many mountains spreads its load instead of bursting Open-Meteo at once."""
    if JITTER_SECONDS > 0:
        await asyncio.sleep(random.uniform(0, JITTER_SECONDS))


async def fetch_forecast(mountain: dict) -> dict[str, ModelSeries]:
    """Fetch all three models, keyed 'hrrr'|'gfs'|'ecmwf'.

    Two requests (contract §5.1 gotcha): one for gfs_seamless,ecmwf_ifs025 and a
    SEPARATE one for gfs_hrrr, so HRRR failure / non-CONUS doesn't kill the others.
    A failed/unavailable HRRR yields ModelSeries(available=False).
    """
    await _apply_jitter()
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        primary_task = _get(client, mountain, (GFS, ECMWF))
        hrrr_task = _get(client, mountain, (HRRR,))
        results = await asyncio.gather(primary_task, hrrr_task, return_exceptions=True)
    primary, hrrr = results

    if isinstance(primary, Exception):
        # Both GFS and ECMWF gone is unrecoverable for this fetch -> caller decides.
        raise primary if isinstance(primary, OpenMeteoError) else OpenMeteoError(str(primary))

    elevations = mountain["elevations"]
    series = parse_models(primary, (GFS, ECMWF), elevations)
    out = {"gfs": series[GFS], "ecmwf": series[ECMWF]}

    if isinstance(hrrr, Exception):
        out["hrrr"] = ModelSeries(available=False)
    else:
        out["hrrr"] = parse_models(hrrr, (HRRR,), elevations)[HRRR]
    return out
