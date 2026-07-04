import asyncio
import math

import httpx
import pytest

from weather_worker import open_meteo_client as omc

MOUNTAIN = {
    "slug": "mt-rainier", "lat": 46.8517, "lng": -121.7603,
    "elevations": {"base": 5420, "mid": 10188, "summit": 14410},
    "timezone": "America/Los_Angeles",
}

# Combined gfs_seamless,ecmwf_ifs025 response (snake_case + _model suffixes).
MULTI_BODY = {
    "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
    "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
    "hourly_units": {
        "temperature_2m": "°F", "freezing_level_height": "m",
        # geopotential comes back in feet under imperial params (suffixed per model)
        "geopotential_height_925hPa_gfs_seamless": "ft",
        "geopotential_height_850hPa_gfs_seamless": "ft",
        "geopotential_height_700hPa_gfs_seamless": "ft",
        "geopotential_height_600hPa_gfs_seamless": "ft",
        "geopotential_height_500hPa_gfs_seamless": "ft",
        "geopotential_height_400hPa_gfs_seamless": "ft",
        "geopotential_height_925hPa_ecmwf_ifs025": "ft",
        "geopotential_height_850hPa_ecmwf_ifs025": "ft",
        "geopotential_height_700hPa_ecmwf_ifs025": "ft",
        "geopotential_height_600hPa_ecmwf_ifs025": "ft",
        "geopotential_height_500hPa_ecmwf_ifs025": "ft",
        "geopotential_height_400hPa_ecmwf_ifs025": "ft",
    },
    "hourly": {
        "time": ["2026-08-02T00:00", "2026-08-02T01:00", "2026-08-02T12:00"],
        "temperature_2m_gfs_seamless": [50.0, 49.0, 60.0],
        "temperature_2m_ecmwf_ifs025": [51.0, 50.0, 61.0],
        "apparent_temperature_gfs_seamless": [48.0, 47.0, 58.0],
        "apparent_temperature_ecmwf_ifs025": [49.0, 48.0, 59.0],
        "wind_speed_10m_gfs_seamless": [10.0, 12.0, 8.0],
        "wind_speed_10m_ecmwf_ifs025": [9.0, 11.0, 7.0],
        "wind_gusts_10m_gfs_seamless": [18.0, 22.0, 14.0],
        "wind_gusts_10m_ecmwf_ifs025": [17.0, 21.0, 13.0],
        "wind_direction_10m_gfs_seamless": [220, 230, 200],
        "wind_direction_10m_ecmwf_ifs025": [225, 235, 205],
        "precipitation_gfs_seamless": [0.0, 0.0, 0.01],
        "precipitation_ecmwf_ifs025": [0.0, 0.0, 0.02],
        "precipitation_probability_gfs_seamless": [5, 5, 20],
        "precipitation_probability_ecmwf_ifs025": [4, 6, 22],
        "snowfall_gfs_seamless": [0.0, 0.0, 0.0],
        "snowfall_ecmwf_ifs025": [0.0, 0.0, 0.0],
        "freezing_level_height_gfs_seamless": [3000.0, 3050.0, 3500.0],
        "freezing_level_height_ecmwf_ifs025": [3100.0, 3150.0, 3600.0],
        "cloud_cover_gfs_seamless": [10, 12, 30],
        "cloud_cover_ecmwf_ifs025": [8, 10, 28],
        "visibility_gfs_seamless": [24000, 24000, 20000],
        "visibility_ecmwf_ifs025": [24000, 24000, 20000],
        "weather_code_gfs_seamless": [0, 1, 2],
        "weather_code_ecmwf_ifs025": [0, 1, 2],
        # pressure-level temps (°F). Bands are resolved per-mountain by nearest
        # geopotential height (ft), NOT fixed levels. For Rainier elevations
        # base=5420, mid=10188, summit=14410 the nearest levels are:
        #   base   -> 850 hPa (~5000 ft)
        #   mid    -> 700 hPa (~10000 ft)
        #   summit -> 500 hPa (~14400 ft)  (NOT 700 hPa, which is mid altitude)
        "temperature_925hPa_gfs_seamless": [60.0, 59.0, 70.0],
        "temperature_925hPa_ecmwf_ifs025": [61.0, 60.0, 71.0],
        "temperature_850hPa_gfs_seamless": [55.0, 54.0, 64.0],
        "temperature_850hPa_ecmwf_ifs025": [56.0, 55.0, 65.0],
        "temperature_700hPa_gfs_seamless": [44.0, 43.0, 53.0],
        "temperature_700hPa_ecmwf_ifs025": [45.0, 44.0, 54.0],
        "temperature_600hPa_gfs_seamless": [36.0, 35.0, 45.0],
        "temperature_600hPa_ecmwf_ifs025": [37.0, 36.0, 46.0],
        "temperature_500hPa_gfs_seamless": [30.0, 29.0, 38.0],
        "temperature_500hPa_ecmwf_ifs025": [31.0, 30.0, 39.0],
        "temperature_400hPa_gfs_seamless": [10.0, 9.0, 18.0],
        "temperature_400hPa_ecmwf_ifs025": [11.0, 10.0, 19.0],
        # geopotential heights (ft) per level -> drives band selection
        "geopotential_height_925hPa_gfs_seamless": [2500.0, 2500.0, 2500.0],
        "geopotential_height_925hPa_ecmwf_ifs025": [2500.0, 2500.0, 2500.0],
        "geopotential_height_850hPa_gfs_seamless": [5000.0, 5000.0, 5000.0],
        "geopotential_height_850hPa_ecmwf_ifs025": [5000.0, 5000.0, 5000.0],
        "geopotential_height_700hPa_gfs_seamless": [10000.0, 10000.0, 10000.0],
        "geopotential_height_700hPa_ecmwf_ifs025": [10000.0, 10000.0, 10000.0],
        "geopotential_height_600hPa_gfs_seamless": [13000.0, 13000.0, 13000.0],
        "geopotential_height_600hPa_ecmwf_ifs025": [13000.0, 13000.0, 13000.0],
        "geopotential_height_500hPa_gfs_seamless": [14400.0, 14400.0, 14400.0],
        "geopotential_height_500hPa_ecmwf_ifs025": [14400.0, 14400.0, 14400.0],
        "geopotential_height_400hPa_gfs_seamless": [23000.0, 23000.0, 23000.0],
        "geopotential_height_400hPa_ecmwf_ifs025": [23000.0, 23000.0, 23000.0],
    },
}

# Separate gfs_hrrr response (single model -> NO suffix per contract §5.1).
HRRR_BODY = {
    "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
    "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
    "hourly_units": {
        "temperature_2m": "°F",
        # single-model HRRR -> no suffix on unit keys; geopotential in feet
        "geopotential_height_925hPa": "ft",
        "geopotential_height_850hPa": "ft",
        "geopotential_height_700hPa": "ft",
        "geopotential_height_600hPa": "ft",
        "geopotential_height_500hPa": "ft",
        "geopotential_height_400hPa": "ft",
    },
    "hourly": {
        "time": ["2026-08-02T00:00", "2026-08-02T01:00", "2026-08-02T12:00"],
        "temperature_2m": [50.5, 49.5, 60.5],
        "apparent_temperature": [48.5, 47.5, 58.5],
        "wind_speed_10m": [11.0, 13.0, 9.0],
        "wind_gusts_10m": [19.0, 23.0, 15.0],
        "wind_direction_10m": [221, 231, 201],
        "precipitation": [0.0, 0.0, 0.0],
        "precipitation_probability": [5, 5, 18],
        "snowfall": [0.0, 0.0, 0.0],
        "freezing_level_height": [3010.0, 3060.0, 3510.0],
        "cloud_cover": [9, 11, 29],
        "visibility": [24000, 24000, 20000],
        "weather_code": [0, 1, 2],
        "temperature_925hPa": [60.5, 59.5, 70.5],
        "temperature_850hPa": [55.5, 54.5, 64.5],
        "temperature_700hPa": [44.5, 43.5, 53.5],
        "temperature_600hPa": [36.5, 35.5, 45.5],
        "temperature_500hPa": [30.5, 29.5, 38.5],
        "temperature_400hPa": [10.5, 9.5, 18.5],
        "geopotential_height_925hPa": [2500.0, 2500.0, 2500.0],
        "geopotential_height_850hPa": [5000.0, 5000.0, 5000.0],
        "geopotential_height_700hPa": [10000.0, 10000.0, 10000.0],
        "geopotential_height_600hPa": [13000.0, 13000.0, 13000.0],
        "geopotential_height_500hPa": [14400.0, 14400.0, 14400.0],
        "geopotential_height_400hPa": [23000.0, 23000.0, 23000.0],
    },
}


@pytest.mark.asyncio
async def test_fetch_returns_three_model_series(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    result = await omc.fetch_forecast(MOUNTAIN)

    assert set(result.keys()) == {"hrrr", "gfs", "ecmwf"}
    assert result["gfs"].available is True
    assert result["ecmwf"].available is True
    assert result["hrrr"].available is True
    # snake_case vars de-suffixed into ModelSeries
    assert result["gfs"].temperature_2m == [50.0, 49.0, 60.0]
    assert result["ecmwf"].wind_gusts_10m == [17.0, 21.0, 13.0]
    assert result["hrrr"].temperature_2m == [50.5, 49.5, 60.5]


@pytest.mark.asyncio
async def test_freezing_level_converted_meters_to_feet(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    result = await omc.fetch_forecast(MOUNTAIN)
    assert math.isclose(result["gfs"].freezing_level_height[0], 3000.0 * 3.28084, rel_tol=1e-6)


def test_freezing_level_not_converted_when_api_returns_feet():
    """Regression: under imperial params Open-Meteo returns freezing_level_height in
    feet (hourly_units == 'ft'); parse_models must NOT double-convert it."""
    body = {
        "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
        "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
        "hourly_units": {"freezing_level_height": "ft"},
        "hourly": {
            "time": ["2026-08-02T00:00", "2026-08-02T01:00"],
            "freezing_level_height_gfs_seamless": [10498.7, 10137.8],
            "freezing_level_height_ecmwf_ifs025": [10500.0, 10200.0],
        },
    }
    series = omc.parse_models(
        body, models=("gfs_seamless", "ecmwf_ifs025"), elevations=MOUNTAIN["elevations"]
    )
    assert series["gfs_seamless"].freezing_level_height == [10498.7, 10137.8]


def test_freezing_level_feet_with_model_suffixed_unit_keys():
    """Regression: real multi-model responses suffix the UNIT keys too
    (freezing_level_height_gfs_seamless: 'ft'); must not double-convert."""
    body = {
        "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
        "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
        "hourly_units": {
            "freezing_level_height_gfs_seamless": "ft",
            "freezing_level_height_ecmwf_ifs025": "undefined",
        },
        "hourly": {
            "time": ["2026-08-02T00:00", "2026-08-02T01:00"],
            "freezing_level_height_gfs_seamless": [10498.7, 10137.8],
            "freezing_level_height_ecmwf_ifs025": [None, None],
        },
    }
    series = omc.parse_models(
        body, models=("gfs_seamless", "ecmwf_ifs025"), elevations=MOUNTAIN["elevations"]
    )
    assert series["gfs_seamless"].freezing_level_height == [10498.7, 10137.8]
    assert series["ecmwf_ifs025"].freezing_level_height == [None, None]


@pytest.mark.asyncio
async def test_pressure_band_temps_mapped_to_temp_fields(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    result = await omc.fetch_forecast(MOUNTAIN)
    # Bands resolved by nearest geopotential height to each band elevation:
    #   base=5420  -> 850 hPa (~5000 ft)
    #   mid=10188  -> 700 hPa (~10000 ft)
    #   summit=14410 -> 500 hPa (~14400 ft)  -- NOT 700 hPa
    assert result["gfs"].temp_base_f == [55.0, 54.0, 64.0]    # 850 hPa
    assert result["gfs"].temp_mid_f == [44.0, 43.0, 53.0]     # 700 hPa
    assert result["gfs"].temp_summit_f == [30.0, 29.0, 38.0]  # 500 hPa


def test_summit_band_uses_nearest_geopotential_not_fixed_700hpa():
    """C1 regression (Rainier June-20): summit temp must come from the level whose
    geopotential height is nearest the summit elevation (14,410 ft -> ~500 hPa),
    NOT the fixed 700 hPa level (~10,000 ft = the MID band)."""
    elevations = {"base": 5420, "mid": 10188, "summit": 14410}
    series = omc.parse_models(
        MULTI_BODY, models=("gfs_seamless", "ecmwf_ifs025"), elevations=elevations
    )
    gfs = series["gfs_seamless"]
    # summit -> 500 hPa series (height ~14400 ft), not 700 hPa (~10000 ft)
    assert gfs.temp_summit_f == [30.0, 29.0, 38.0]
    assert gfs.temp_summit_f != [44.0, 43.0, 53.0]  # would be the old 700 hPa pick
    # base -> 850 hPa, mid -> 700 hPa
    assert gfs.temp_base_f == [55.0, 54.0, 64.0]
    assert gfs.temp_mid_f == [44.0, 43.0, 53.0]


def test_geopotential_height_converted_meters_to_feet_for_band_selection():
    """When geopotential comes back in meters (plain/non-imperial response), the
    worker converts m->ft (same unit-aware pattern as freezing level) before
    choosing the nearest band level."""
    body = {
        "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
        "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
        "hourly_units": {
            "geopotential_height_700hPa": "m",
            "geopotential_height_500hPa": "m",
        },
        "hourly": {
            "time": ["2026-08-02T00:00", "2026-08-02T12:00"],
            "temperature_700hPa": [44.0, 53.0],
            "temperature_500hPa": [30.0, 38.0],
            # heights in METERS: 700 hPa ~3048 m (~10000 ft), 500 hPa ~4392 m (~14410 ft)
            "geopotential_height_700hPa": [3048.0, 3048.0],
            "geopotential_height_500hPa": [4392.0, 4392.0],
        },
    }
    elevations = {"base": 5420, "mid": 10188, "summit": 14410}
    series = omc.parse_models(body, models=("gfs_seamless",), elevations=elevations)
    gfs = series["gfs_seamless"]
    # 4392 m ~= 14409 ft -> nearest summit; 3048 m ~= 10000 ft -> nearest mid
    assert gfs.temp_summit_f == [30.0, 38.0]
    assert gfs.temp_mid_f == [44.0, 53.0]


def test_level_with_all_null_geopotential_excluded():
    """A candidate level whose geopotential series is entirely null for a model is
    excluded from band selection for that model."""
    body = {
        "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
        "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
        "hourly_units": {
            "geopotential_height_700hPa": "ft",
            "geopotential_height_500hPa": "ft",
        },
        "hourly": {
            "time": ["2026-08-02T00:00", "2026-08-02T12:00"],
            "temperature_700hPa": [44.0, 53.0],
            "temperature_500hPa": [30.0, 38.0],
            # 500 hPa heights all null -> excluded; summit falls back to 700 hPa
            "geopotential_height_700hPa": [10000.0, 10000.0],
            "geopotential_height_500hPa": [None, None],
        },
    }
    elevations = {"base": 5420, "mid": 10188, "summit": 14410}
    series = omc.parse_models(body, models=("gfs_seamless",), elevations=elevations)
    gfs = series["gfs_seamless"]
    assert gfs.temp_summit_f == [44.0, 53.0]  # 500 excluded -> nearest is 700


@pytest.mark.asyncio
async def test_hrrr_failure_does_not_kill_other_models(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    # HRRR outside-CONUS / outage -> HTTP 400 {error, reason}
    httpx_mock.add_response(
        url=_match("gfs_hrrr"), status_code=400,
        json={"error": True, "reason": "No data is available for this location"})

    result = await omc.fetch_forecast(MOUNTAIN)
    assert result["gfs"].available is True
    assert result["ecmwf"].available is True
    assert result["hrrr"].available is False


@pytest.mark.asyncio
async def test_http_400_on_primary_call_raises(httpx_mock):
    httpx_mock.add_response(
        url=_match("gfs_seamless,ecmwf_ifs025"), status_code=400,
        json={"error": True, "reason": "Invalid timezone"})
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    with pytest.raises(omc.OpenMeteoError, match="Invalid timezone"):
        await omc.fetch_forecast(MOUNTAIN)


@pytest.mark.asyncio
async def test_deterministic_400_not_retried(httpx_mock):
    # R1: an HTTP 400 {error} body is deterministic; it must NOT be retried 3x.
    httpx_mock.add_response(
        url=_match("gfs_seamless,ecmwf_ifs025"), status_code=400,
        json={"error": True, "reason": "Invalid timezone"})
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    with pytest.raises(omc.OpenMeteoError):
        await omc.fetch_forecast(MOUNTAIN)
    primary = [r for r in httpx_mock.get_requests()
               if r.url.params.get("models") == "gfs_seamless,ecmwf_ifs025"]
    assert len(primary) == 1  # single attempt, no retry


@pytest.mark.asyncio
async def test_throttle_400_is_retried_then_succeeds(httpx_mock):
    # Open-Meteo signals its concurrency limit with HTTP 400 {reason: "Too many
    # concurrent requests"}. Unlike a deterministic bad-params 400, this is
    # transient and MUST be retried (the thundering-herd fix).
    httpx_mock.add_response(
        url=_match("gfs_seamless,ecmwf_ifs025"), status_code=400,
        json={"error": True, "reason": "Too many concurrent requests"})
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    result = await omc.fetch_forecast(MOUNTAIN)

    assert result["gfs"].available is True
    primary = [r for r in httpx_mock.get_requests()
               if r.url.params.get("models") == "gfs_seamless,ecmwf_ifs025"]
    assert len(primary) == 2  # one throttled + one successful retry


@pytest.mark.asyncio
async def test_http_429_rate_limit_is_retried_then_succeeds(httpx_mock):
    # HTTP 429 (minutely/hourly rate limit) is also transient -> retried.
    httpx_mock.add_response(
        url=_match("gfs_seamless,ecmwf_ifs025"), status_code=429,
        json={"error": True, "reason": "Minutely API request limit exceeded"})
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    result = await omc.fetch_forecast(MOUNTAIN)

    assert result["gfs"].available is True
    primary = [r for r in httpx_mock.get_requests()
               if r.url.params.get("models") == "gfs_seamless,ecmwf_ifs025"]
    assert len(primary) == 2


@pytest.mark.asyncio
async def test_5xx_is_retried_then_succeeds(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), status_code=503)
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    result = await omc.fetch_forecast(MOUNTAIN)

    assert result["gfs"].available is True
    primary = [r for r in httpx_mock.get_requests()
               if r.url.params.get("models") == "gfs_seamless,ecmwf_ifs025"]
    assert len(primary) == 2


@pytest.mark.asyncio
@pytest.mark.httpx_mock(can_send_already_matched_responses=True)
async def test_throttle_exhausts_retries_then_raises(httpx_mock):
    # A throttle that never clears exhausts the retry budget and raises a distinct
    # OpenMeteoThrottled (subclass of OpenMeteoError) so the worker can re-raise it
    # to Pub/Sub for the next run. Each registered response may match repeatedly.
    httpx_mock.add_response(
        url=_match("gfs_seamless,ecmwf_ifs025"), status_code=400,
        json={"error": True, "reason": "Too many concurrent requests"})
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    with pytest.raises(omc.OpenMeteoThrottled, match="Too many concurrent requests"):
        await omc.fetch_forecast(MOUNTAIN)

    primary = [r for r in httpx_mock.get_requests()
               if r.url.params.get("models") == "gfs_seamless,ecmwf_ifs025"]
    assert len(primary) == omc.RETRY_MAX_ATTEMPTS  # all attempts consumed


@pytest.mark.asyncio
async def test_fetch_applies_startup_jitter(httpx_mock, monkeypatch):
    # Each worker sleeps a random 0..JITTER_SECONDS before its first API call so a
    # fan-out to many mountains doesn't burst Open-Meteo simultaneously.
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    sleeps: list[float] = []
    uniform_args: list[tuple] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    def fake_uniform(lo, hi):
        uniform_args.append((lo, hi))
        return hi  # deterministic max

    monkeypatch.setattr(omc, "JITTER_SECONDS", 30.0)
    monkeypatch.setattr(omc.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(omc.random, "uniform", fake_uniform)

    await omc.fetch_forecast(MOUNTAIN)

    assert uniform_args[0] == (0, 30.0)  # jitter drawn from [0, JITTER_SECONDS]
    assert sleeps and sleeps[0] == 30.0  # and slept that long before fetch


@pytest.mark.asyncio
async def test_attempt_is_hard_bounded_by_timeout_and_retried(monkeypatch):
    # A single attempt that stalls past REQUEST_TIMEOUT_SECONDS is cut off (hard
    # ceiling) and retried, so worst-case wall-clock stays within the 120s worker
    # timeout regardless of httpx per-phase timeout semantics.
    monkeypatch.setattr(omc, "REQUEST_TIMEOUT_SECONDS", 0.02)
    monkeypatch.setattr(omc, "RETRY_MAX_ATTEMPTS", 2)
    calls = 0

    class StallClient:
        async def get(self, *args, **kwargs):
            nonlocal calls
            calls += 1
            await asyncio.sleep(1.0)  # never completes within the per-attempt ceiling

    with pytest.raises(asyncio.TimeoutError):
        await omc._get(StallClient(), MOUNTAIN, (omc.GFS, omc.ECMWF))
    assert calls == 2  # each attempt hard-bounded, then retried up to the budget


@pytest.mark.asyncio
async def test_no_jitter_when_disabled(httpx_mock, monkeypatch):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    sleeps: list[float] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(omc, "JITTER_SECONDS", 0.0)
    monkeypatch.setattr(omc.asyncio, "sleep", fake_sleep)

    await omc.fetch_forecast(MOUNTAIN)

    assert sleeps == []  # no jitter sleep when disabled


@pytest.mark.asyncio
async def test_request_uses_imperial_units_and_timezone(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    await omc.fetch_forecast(MOUNTAIN)
    primary = [r for r in httpx_mock.get_requests()
               if r.url.params.get("models") == "gfs_seamless,ecmwf_ifs025"][0]
    q = primary.url.params
    assert q["temperature_unit"] == "fahrenheit"
    assert q["wind_speed_unit"] == "mph"
    assert q["precipitation_unit"] == "inch"
    assert q["timezone"] == "America/Los_Angeles"
    assert q["forecast_days"] == "7"


def test_contract_fixture_parses(load_fixture):
    """Contract test: the saved real response (Task 14) parses into ModelSeries."""
    body = load_fixture("open_meteo_forecast.json")
    series = omc.parse_models(
        body, models=("gfs_seamless", "ecmwf_ifs025"), elevations=MOUNTAIN["elevations"]
    )
    assert "gfs_seamless" in series
    assert len(series["gfs_seamless"].time) > 0


def _match(model_substr):
    """httpx_mock URL matcher: any open-meteo forecast URL containing model_substr."""
    import re
    return re.compile(r"https://api\.open-meteo\.com/v1/forecast.*"
                      + re.escape(model_substr).replace(",", "%2C") + r".*")


@pytest.mark.asyncio
async def test_primary_timeout_wraps_into_unavailable_with_nonblank_message(monkeypatch):
    # A raw asyncio.TimeoutError (what asyncio.wait_for raises when Open-Meteo hangs)
    # must surface as OpenMeteoUnavailable with a NON-BLANK message — reproduces the
    # 2026-07-03 error="" masking bug.
    async def _timeout(_client, _mountain, _models):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(omc, "_get", _timeout)
    monkeypatch.setattr(omc, "JITTER_SECONDS", 0.0)

    with pytest.raises(omc.OpenMeteoUnavailable) as ei:
        await omc.fetch_forecast(MOUNTAIN)
    assert str(ei.value)  # non-blank
    assert isinstance(ei.value, omc.OpenMeteoError)  # still caught by the worker's handler


def test_retuned_defaults_fit_worker_timeout(monkeypatch):
    # The suite-wide autouse fixture (conftest._fast_open_meteo_io) zeroes
    # JITTER_SECONDS/RETRY_WAIT_MAX_SECONDS for test speed; undo it here so this
    # test reads the real unpatched module defaults, not the zeroed test values.
    monkeypatch.undo()
    budget = (
        omc.JITTER_SECONDS
        + omc.RETRY_MAX_ATTEMPTS * omc.REQUEST_TIMEOUT_SECONDS
        + (omc.RETRY_MAX_ATTEMPTS - 1) * omc.RETRY_WAIT_MAX_SECONDS
    )
    assert budget < 120  # worst-case wall-clock under the weather-worker timeout
    assert omc.JITTER_SECONDS == 20  # wider herd spread for 39 mountains
