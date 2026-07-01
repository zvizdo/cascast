import math

from shared.models import CombinedForecastBlob, ModelSeries
from weather_worker import summary


def _series():
    # two days; target = 2026-08-02 has hours at 00:00, 12:00, 18:00
    return ModelSeries(
        time=["2026-08-01T12:00", "2026-08-02T00:00", "2026-08-02T12:00", "2026-08-02T18:00"],
        temperature_2m=[40.0, 10.0, 30.0, 20.0],
        wind_speed_10m=[10.0, 18.0, 25.0, 12.0],
        wind_gusts_10m=[20.0, 35.0, 50.0, 25.0],
        precipitation=[0.0, 0.1, 0.2, 0.0],
        snowfall=[0.0, 1.0, 2.0, 0.0],
        freezing_level_height=[6000.0, 5000.0, 7000.0, 6500.0],
        temp_summit_f=[15.0, 8.0, 22.0, 18.0],
    )


def test_model_day_summary_target_date_aggregates():
    s = summary.model_day_summary(_series(), "2026-08-02")
    assert s.available is True
    assert s.summitHighF == 22.0           # max temp_summit_f on target day
    assert s.summitLowF == 8.0             # min
    assert s.summitMaxWindMph == 50.0      # max gust
    assert s.summitMaxSustainedWindMph == 25.0  # max wind_speed_10m on target day (distinct from gust)
    assert math.isclose(s.summitPrecipIn, 0.3, rel_tol=1e-6)  # sum (0.1+0.2+0.0 on target day)
    assert s.freezingLevelFtNoon == 7000.0 # value at 12:00 local
    assert math.isclose(s.snowfallIn, 3.0, rel_tol=1e-6)      # sum


def test_model_day_summary_falls_back_to_2m_when_no_summit_band():
    s = ModelSeries(time=["2026-08-02T12:00"], temperature_2m=[30.0],
                    wind_gusts_10m=[10.0], precipitation=[0.0], snowfall=[0.0],
                    freezing_level_height=[7000.0])
    out = summary.model_day_summary(s, "2026-08-02")
    assert out.summitHighF == 30.0  # uses temperature_2m fallback


def test_model_day_summary_uses_zero_summit_band_not_2m():
    # B2: all-zero (but present) summit band must be used, not the warmer 2m temps.
    s = ModelSeries(time=["2026-08-02T00:00", "2026-08-02T12:00"],
                    temperature_2m=[40.0, 45.0],
                    wind_speed_10m=[5.0, 5.0], wind_gusts_10m=[10.0, 10.0],
                    precipitation=[0.0, 0.0], snowfall=[0.0, 0.0],
                    freezing_level_height=[7000.0, 7000.0],
                    temp_summit_f=[0.0, 0.0])
    out = summary.model_day_summary(s, "2026-08-02")
    assert out.summitHighF == 0.0   # uses summit band, not 2m (40/45)
    assert out.summitLowF == 0.0


def test_model_day_summary_unavailable_when_no_data():
    s = ModelSeries(available=False)
    out = summary.model_day_summary(s, "2026-08-02")
    assert out.available is False


def test_model_day_summary_no_hours_for_target_unavailable():
    out = summary.model_day_summary(_series(), "2030-01-01")
    assert out.available is False


def test_summary_model_precedence_prefers_hrrr():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z",
        hrrr=_series(), gfs=_series(), ecmwf=_series())
    model, _ = summary.choose_summary_model(blob, "2026-08-02")
    assert model == "hrrr"


def _null_padded_series():
    """A model that lists the target date but null-pads every value (HRRR >48h)."""
    return ModelSeries(
        time=["2026-08-02T00:00", "2026-08-02T12:00"],
        temperature_2m=[None, None], wind_speed_10m=[None, None],
        wind_gusts_10m=[None, None], precipitation=[None, None],
        snowfall=[None, None], freezing_level_height=[None, None],
        temp_summit_f=[None, None])


def test_model_day_summary_unavailable_when_values_all_null_for_date():
    out = summary.model_day_summary(_null_padded_series(), "2026-08-02")
    assert out.available is False  # date present but no usable temps -> not available


def test_choose_summary_model_falls_through_null_padded_hrrr_to_gfs():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z",
        hrrr=_null_padded_series(), gfs=_series(), ecmwf=_series())
    model, s = summary.choose_summary_model(blob, "2026-08-02")
    assert model == "gfs"
    assert s.summitHighF is not None


def test_summary_model_precedence_skips_unavailable_hrrr():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z",
        hrrr=ModelSeries(available=False), gfs=_series(), ecmwf=_series())
    model, _ = summary.choose_summary_model(blob, "2026-08-02")
    assert model == "gfs"


def test_precip_type_snow_when_below_freezing_and_snowfall():
    assert summary.precip_type(precip=0.2, snowfall=2.0,
                               freezing_level_ft=5000, summit_ft=14410) == "snow"


def test_precip_type_rain_when_freezing_above_summit():
    assert summary.precip_type(precip=0.2, snowfall=0.0,
                               freezing_level_ft=15000, summit_ft=14410) == "rain"


def test_precip_type_mixed_near_summit():
    assert summary.precip_type(precip=0.2, snowfall=0.0,
                               freezing_level_ft=14300, summit_ft=14410) == "mixed"


def test_precip_type_not_snow_without_snowfall():
    # B3: precip present, no snowfall, freezing level below summit must NOT be "snow".
    assert summary.precip_type(precip=0.2, snowfall=0.0,
                               freezing_level_ft=13800, summit_ft=14410) != "snow"


def test_precip_type_none_when_dry():
    assert summary.precip_type(precip=0.0, snowfall=0.0,
                               freezing_level_ft=6000, summit_ft=14410) == "none"


def test_build_current_summary_uses_chosen_model_and_precip_type():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z", gfs=_series())
    cs = summary.build_current_summary(blob, "2026-08-02", summit_ft=14410,
                                       tone="caution", verdict="x")
    assert cs.summaryModel == "gfs"
    assert cs.targetDateHigh == 22.0
    assert cs.precipType == "snow"   # freezing 7000 < summit, snowfall present
    assert cs.tone == "caution"


def test_all_model_summaries_by_day_maps_each_present_day_per_model():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-01T00:00:00Z", gfs=_series(), ecmwf=_series())
    out = summary.all_model_summaries_by_day(blob)
    # hrrr absent -> empty map; gfs/ecmwf carry both forecast days keyed by ISO date.
    assert out["hrrr"] == {}
    assert set(out["gfs"]) == {"2026-08-01", "2026-08-02"}
    assert set(out["ecmwf"]) == {"2026-08-01", "2026-08-02"}
    # values match per-day model_day_summary for the chosen date.
    assert out["gfs"]["2026-08-02"]["summitHighF"] == 22.0
    assert out["gfs"]["2026-08-02"]["available"] is True
    # 2026-08-01 has a single hour (12:00, summit 15.0).
    assert out["gfs"]["2026-08-01"]["summitHighF"] == 15.0


def test_all_model_summaries_by_day_skips_null_padded_days():
    # HRRR-style: time padded to a second day but values null past day 1 -> that day omitted.
    padded = ModelSeries(
        time=["2026-08-01T12:00", "2026-08-02T12:00"],
        temperature_2m=[30.0, None], wind_gusts_10m=[20.0, None],
        precipitation=[0.0, None], snowfall=[0.0, None],
        freezing_level_height=[7000.0, None], temp_summit_f=[20.0, None])
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-01T00:00:00Z", hrrr=padded)
    out = summary.all_model_summaries_by_day(blob)
    assert set(out["hrrr"]) == {"2026-08-01"}  # null-padded 08-02 dropped
    assert out["gfs"] == {}  # absent model -> empty map
