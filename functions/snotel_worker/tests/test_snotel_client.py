import httpx
import pytest

from snotel_worker import snotel_client


def test_window_is_35_days():
    from snotel_worker import snotel_client as sc
    assert sc.WINDOW_DAYS == 35


def test_index_values_by_date():
    values = [{"date": "2026-06-08", "value": 1.0}, {"date": "2026-06-09", "value": 2.0}]
    idx = snotel_client._index_by_date(values)
    assert idx["2026-06-08"] == {"value": 1.0, "median": None}
    assert idx["2026-06-09"]["value"] == 2.0


def test_percent_of_median_guards_zero_and_none():
    assert snotel_client._percent_of_median(18.0, 9.0) == 200.0
    assert snotel_client._percent_of_median(18.0, 0) is None
    assert snotel_client._percent_of_median(18.0, None) is None
    assert snotel_client._percent_of_median(None, 9.0) is None


def test_daily_precip_diffs_cumulative():
    # cumulative PREC by date → daily diff; first day yields None (no prior)
    series = {"2026-06-08": 60.0, "2026-06-09": 60.3, "2026-06-11": 60.8}
    daily = snotel_client._daily_precip(series, "2026-06-11", "2026-06-09")
    assert daily == pytest.approx(0.5)  # 60.8 - 60.3


def test_parse_data_builds_current_and_trend(load_fixture):
    fixture = load_fixture("snotel.json")
    station = snotel_client.parse_stations(fixture["stations"])["679:WA:SNTL"]
    data = snotel_client.parse_data(
        fixture["data"], station_id="679", station=station,
    )
    assert data.stationTriplet == "679:WA:SNTL"
    assert data.stationName == "Paradise"
    assert data.elevationFt == 5150  # real Paradise SNOTEL elevation (ft)
    # current = latest available date (2026-06-13, real 30-day window end)
    assert data.current.date == "2026-06-13"
    assert data.current.sweIn == 3.8
    assert data.current.snowDepthIn == 0.0  # melted out by mid-June
    assert data.current.sweMedianIn == 48.8
    assert data.current.percentOfMedian == pytest.approx(3.8 / 48.8 * 100)
    assert data.current.tempMaxF == 69.3
    assert data.current.tempMinF == 50.0
    # trend aligned by date, oldest→newest, spans the 30-day window
    assert len(data.trend) == 30
    assert data.trend[0].date == "2026-05-15"
    assert data.trend[-1].date == "2026-06-13"
    # SNWD is missing 2026-06-10 → that day carries a null snow depth (align-by-date, not zip)
    by_date = {r.date: r for r in data.trend}
    assert by_date["2026-06-10"].snowDepthIn is None
    assert by_date["2026-06-09"].snowDepthIn is not None


def test_parse_stations_resolves_meta(load_fixture):
    stations = snotel_client.parse_stations(load_fixture("snotel.json")["stations"])
    meta = stations["679:WA:SNTL"]
    assert meta["name"] == "Paradise"
    assert meta["lat"] == 46.78266
    assert meta["lng"] == -121.74767


@pytest.mark.asyncio
async def test_fetch_data_hits_rest_endpoint(httpx_mock, load_fixture):
    httpx_mock.add_response(
        json={"data": load_fixture("snotel.json")["data"]},
    )
    raw = await snotel_client.fetch_data("679", "679:WA:SNTL")
    assert raw[0]["stationTriplet"] == "679:WA:SNTL"
    request = httpx_mock.get_requests()[0]
    assert "stationTriplets=679%3AWA%3ASNTL" in str(request.url) or "679:WA:SNTL" in str(request.url)
    assert "elements=WTEQ%2CSNWD%2CTMAX%2CTMIN%2CPREC" in str(request.url) or "WTEQ,SNWD,TMAX,TMIN,PREC" in str(request.url)
    assert "centralTendencyType=MEDIAN" in str(request.url)


def test_daily_precip_none_when_prior_missing():
    series = {"2026-06-09": None, "2026-06-11": 60.8}
    assert snotel_client._daily_precip(series, "2026-06-11", "2026-06-09") is None
    # current day missing -> None
    assert snotel_client._daily_precip({"2026-06-11": None}, "2026-06-11", "2026-06-09") is None
    # no prior day -> None
    assert snotel_client._daily_precip({"2026-06-11": 60.8}, "2026-06-11", None) is None


@pytest.mark.asyncio
async def test_fetch_station_resolves_triplet(httpx_mock, load_fixture):
    httpx_mock.add_response(json={"stations": load_fixture("snotel.json")["stations"]})
    meta = await snotel_client.fetch_station("679:WA:SNTL")
    assert meta["name"] == "Paradise"
    assert meta["elevationFt"] == 5150


@pytest.mark.asyncio
async def test_fetch_station_unknown_triplet_returns_default(httpx_mock):
    httpx_mock.add_response(json={"stations": []})
    meta = await snotel_client.fetch_station("999:WA:SNTL")
    assert meta == {"name": "", "elevationFt": 0.0, "lat": 0.0, "lng": 0.0}


@pytest.mark.asyncio
async def test_fetch_raises_on_error(httpx_mock):
    httpx_mock.add_response(status_code=503)
    with pytest.raises(httpx.HTTPStatusError):
        await snotel_client.fetch_data("679", "679:WA:SNTL")
