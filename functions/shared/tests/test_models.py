import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from shared.models import (
    OMHourly, OMResponse, OMError, ModelSeries, CombinedForecastBlob,
    ModelDaySummary, CurrentSummary, NwacDanger, NwacProblem, NwacForecast,
    SnotelReading, SnotelData, SatelliteCache,
)


def test_omhourly_allows_dynamic_suffixed_keys():
    h = OMHourly.model_validate({
        "time": ["2026-08-02T00:00", "2026-08-02T01:00"],
        "temperature_2m_gfs_seamless": [50.1, 49.0],
        "freezing_level_height_ecmwf_ifs025": [3200.0, 3250.0],
    })
    assert h.time == ["2026-08-02T00:00", "2026-08-02T01:00"]
    # extra="allow" keeps dynamic keys reachable via model_extra
    assert h.model_extra["temperature_2m_gfs_seamless"] == [50.1, 49.0]


def test_omresponse_parses_core_fields():
    r = OMResponse.model_validate({
        "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
        "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
        "hourly_units": {"temperature_2m": "°F"},
        "hourly": {"time": ["2026-08-02T00:00"], "temperature_2m_gfs_seamless": [50.0]},
    })
    assert r.timezone == "America/Los_Angeles"
    assert r.hourly.time == ["2026-08-02T00:00"]


def test_omerror_shape():
    e = OMError.model_validate({"error": True, "reason": "Cannot initialize HRRR"})
    assert e.error is True
    assert "HRRR" in e.reason


def test_modelseries_defaults_empty_and_accepts_nulls():
    s = ModelSeries(time=["2026-08-02T00:00"], temperature_2m=[50.0, None])
    assert s.available is True
    assert s.temperature_2m == [50.0, None]
    assert s.temp_summit_f == []  # default


def test_combinedforecastblob_camelcase_aliases_roundtrip():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier",
        timezone="America/Los_Angeles",
        fetchedAt=datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc),
        gfs=ModelSeries(time=["2026-08-02T12:00"]),
    )
    assert blob.mountain_id == "mt-rainier"
    dumped = blob.model_dump(by_alias=True)
    assert dumped["mountainId"] == "mt-rainier"
    assert "fetchedAt" in dumped
    # also constructible by python field name (populate_by_name=True)
    blob2 = CombinedForecastBlob(
        mountain_id="mt-baker", timezone="America/Los_Angeles",
        fetched_at=datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc),
    )
    assert blob2.mountain_id == "mt-baker"


def test_modeldaysummary_optional_fields():
    d = ModelDaySummary(available=False)
    assert d.available is False
    assert d.summitHighF is None


def test_currentsummary_requires_tone_and_verdict():
    cs = CurrentSummary(
        targetDateHigh=18.0, targetDateLow=4.0, targetDateWind=40.0,
        targetDatePrecip=0.0, freezingLevelFt=6500.0, precipType="none",
        summaryModel="gfs", tone="caution", verdict="Cold window holds before a front",
    )
    assert cs.tone == "caution"
    with pytest.raises(ValidationError):
        CurrentSummary(targetDateHigh=1, targetDateLow=1, targetDateWind=1,
                       targetDatePrecip=1, freezingLevelFt=1, precipType="none",
                       summaryModel="gfs")  # missing tone+verdict


def test_nwac_models_parse():
    f = NwacForecast(
        zoneId="1648", zoneName="West Slopes South", productId=1, season="winter",
        productType="forecast", publishedTime=datetime(2026, 2, 12, tzinfo=timezone.utc),
        expiresTime=datetime(2026, 2, 13, tzinfo=timezone.utc), forecastDate="2026-02-12",
        danger={"current": NwacDanger(upper=3, middle=3, lower=2).model_dump(),
                "tomorrow": NwacDanger(upper=4, middle=3, lower=2).model_dump()},
        problems=[NwacProblem(problemId=1, name="Wind Slab",
                              aspects={"upper": {"N": True}, "middle": {}, "lower": {}})],
    )
    assert f.zoneId == "1648"
    assert f.problems[0].name == "Wind Slab"


def test_snotel_and_satellite_models_parse():
    sd = SnotelData(
        stationId="679", stationTriplet="679:WA:SNTL", stationName="Paradise",
        elevationFt=5430.0, lat=46.78, lng=-121.74,
        current=SnotelReading(date="2026-02-12", snowDepthIn=112.0, sweIn=38.2),
        trend=[SnotelReading(date="2026-02-11", snowDepthIn=110.0, sweIn=37.9)],
    )
    assert sd.current.snowDepthIn == 112.0
    sc = SatelliteCache(
        mountainId="mt-rainier", tileUrlTemplate="https://tiles/{z}/{y}/{x}.jpg",
        tileSource="eox-s2cloudless", attribution="EOX",
        boundingBox={"north": 47.0, "south": 46.7, "east": -121.6, "west": -121.9},
    )
    assert sc.tileSource == "eox-s2cloudless"
