import httpx
import pytest

from nwac_worker import nwac_client


def test_aspect_rose_parses_location_with_rpartition():
    rose = nwac_client._aspect_rose(["north upper", "northeast upper", "east middle"])
    assert rose["upper"]["N"] is True
    assert rose["upper"]["NE"] is True
    assert rose["middle"]["E"] is True
    assert rose["upper"]["S"] is False
    assert rose["lower"]["N"] is False


def test_sanitize_html_strips_tags_and_collapses_whitespace():
    assert nwac_client._sanitize_html("<p>Hello <strong>world</strong>.</p>") == "Hello world."
    assert nwac_client._sanitize_html(None) is None


def test_rating_clamps_to_valid_range():
    assert nwac_client._rating(None) is None
    assert nwac_client._rating(0) is None
    assert nwac_client._rating(-1) is None
    assert nwac_client._rating(6) is None
    assert nwac_client._rating(3) == 3


def test_parse_winter_forecast(load_fixture):
    fc = nwac_client.parse_product(load_fixture("nwac_winter.json"), zone_id="1648")
    assert fc.season == "winter"
    assert fc.productType == "forecast"
    assert fc.zoneId == "1648"
    assert fc.zoneName == "West Slopes South"
    assert fc.danger["current"].upper == 3
    assert fc.danger["current"].lower == 2
    assert fc.danger["tomorrow"].upper == 3
    assert fc.danger["tomorrow"].lower == 1
    assert len(fc.problems) == 1
    p = fc.problems[0]
    assert p.problemId == 5
    assert p.name == "Wind Slab"
    assert p.sizeMin == "1" and p.sizeMax == "2"
    assert p.aspects["upper"]["N"] is True
    assert "wind slabs" in fc.bottomLine.lower()
    assert "<p>" not in fc.bottomLine


def test_parse_summer_summary_detected_as_summer(load_fixture):
    fc = nwac_client.parse_product(load_fixture("nwac_summer.json"), zone_id="1648")
    assert fc.season == "summer"
    assert fc.productType == "summary"
    assert fc.problems == []
    assert fc.danger["current"].upper is None
    assert fc.zoneId == "1648"
    assert fc.zoneName == "West Slopes South"


def test_parse_summer_stores_requested_zone_not_first(load_fixture):
    # B1: summer summary lists ALL zones; must store the REQUESTED zone, not Olympics (1645).
    fc = nwac_client.parse_product(load_fixture("nwac_summer.json"), zone_id="1648")
    assert fc.zoneId == "1648"
    assert fc.zoneName == "West Slopes South"
    assert fc.zoneName != "Olympics"


def test_forecast_date_is_pacific(load_fixture):
    # N1: published_time 2026-04-20T01:30:00Z -> Pacific date 2026-04-19.
    fc = nwac_client.parse_product(load_fixture("nwac_summer.json"), zone_id="1648")
    assert fc.forecastDate == "2026-04-19"


@pytest.mark.asyncio
async def test_fetch_zone_map_builds_name_to_id(httpx_mock):
    httpx_mock.add_response(
        url="https://api.avalanche.org/v2/public/products/map-layer/NWAC",
        json={"features": [
            {"id": 1648, "properties": {"name": "West Slopes South"}},
            {"id": 1645, "properties": {"name": "Olympics"}},
        ]},
    )
    mapping = await nwac_client.fetch_zone_map()
    assert mapping["West Slopes South"] == 1648
    assert mapping["Olympics"] == 1645


@pytest.mark.asyncio
async def test_fetch_forecast_calls_product_endpoint(httpx_mock, load_fixture):
    httpx_mock.add_response(
        url="https://api.avalanche.org/v2/public/product?type=forecast&center_id=NWAC&zone_id=1648",
        json=load_fixture("nwac_winter.json"),
    )
    fc = await nwac_client.fetch_forecast("1648")
    assert fc.zoneId == "1648"
    assert fc.season == "winter"
    request = httpx_mock.get_requests()[0]
    assert request.headers["Accept"] == "application/json"
    assert "MountainWeatherman" in request.headers["User-Agent"]


@pytest.mark.asyncio
async def test_fetch_forecast_raises_on_http_error(httpx_mock):
    httpx_mock.add_response(status_code=500)
    with pytest.raises(httpx.HTTPStatusError):
        await nwac_client.fetch_forecast("1648")


@pytest.mark.asyncio
async def test_fetch_forecast_does_not_retry_4xx(httpx_mock):
    # N2: a deterministic 404 must NOT be retried -> exactly 1 request.
    httpx_mock.add_response(status_code=404)
    with pytest.raises(httpx.HTTPStatusError):
        await nwac_client.fetch_forecast("1648")
    assert len(httpx_mock.get_requests()) == 1
