import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from shared.models import ModelSeries
from weather_worker import main


def _event(payload: dict):
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": data}})


def _find_event(capsys, name):
    for line in capsys.readouterr().out.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                o = json.loads(line)
            except ValueError:
                continue
            if o.get("event") == name:
                return o
    return None


def _good_series():
    return ModelSeries(
        time=["2026-08-02T00:00", "2026-08-02T12:00"],
        temperature_2m=[10.0, 25.0], wind_gusts_10m=[20.0, 30.0],
        precipitation=[0.0, 0.0], snowfall=[0.0, 0.0],
        freezing_level_height=[6000.0, 6500.0], temp_summit_f=[8.0, 20.0])


@pytest.fixture
def patched(monkeypatch):
    """Patch every external collaborator the worker touches (per-mountain only)."""
    m = SimpleNamespace()
    m.get_mountain = MagicMock(return_value={
        "id": "mt-rainier", "slug": "mt-rainier", "lat": 46.85, "lng": -121.76,
        "timezone": "America/Los_Angeles",
        "elevations": {"base": 5420, "mid": 10188, "summit": 14410}})
    m.write_combined_blob = MagicMock(return_value="forecasts/mt-rainier/2026-08-02/0000-combined.json")
    m.upsert_mountain_conditions = MagicMock()
    m.write_mountain_snapshot = MagicMock(return_value="snap1")
    monkeypatch.setattr(main.fc, "get_mountain", m.get_mountain)
    monkeypatch.setattr(main.sc, "write_combined_blob", m.write_combined_blob)
    monkeypatch.setattr(main.fc, "upsert_mountain_conditions", m.upsert_mountain_conditions)
    monkeypatch.setattr(main.fc, "write_mountain_snapshot", m.write_mountain_snapshot)
    return m


def test_happy_path_writes_blob_conditions_snapshot(patched, monkeypatch):
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": _good_series(), "gfs": _good_series(), "ecmwf": _good_series()}))

    main.handle_message(_event({"mountainId": "mt-rainier", "reason": "manual"}))

    patched.write_combined_blob.assert_called_once()
    patched.upsert_mountain_conditions.assert_called_once()
    patched.write_mountain_snapshot.assert_called_once()
    kwargs = patched.write_mountain_snapshot.call_args.kwargs
    args = patched.write_mountain_snapshot.call_args.args
    # mountain id passed (positional or kw) + models dict + blob path
    assert (args and args[0] == "mt-rainier") or kwargs.get("mountain_id") == "mt-rainier"
    assert kwargs["blob_path"] == "forecasts/mt-rainier/2026-08-02/0000-combined.json"
    # models is per-model, PER-DAY: {hrrr: {date: summary}, gfs: {...}, ecmwf: {...}}
    models = kwargs["models"]
    assert set(models) == {"hrrr", "gfs", "ecmwf"}
    assert all(isinstance(by_day, dict) for by_day in models.values())
    # _good_series has hours on 2026-08-02 -> that date present as a day-summary key.
    assert "2026-08-02" in models["gfs"]
    assert models["gfs"]["2026-08-02"]["available"] is True
    assert models["gfs"]["2026-08-02"]["summitHighF"] == 20.0
    # no project functions exist on fc anymore
    assert not hasattr(main.fc, "projects_for_mountain")
    assert not hasattr(main.fc, "write_weather_snapshot")
    assert not hasattr(main.fc, "update_current_summary")
    assert not hasattr(main.fc, "set_project_refresh_status")
    assert not hasattr(main.fc, "get_active_projects")


def test_one_model_fail_still_writes(patched, monkeypatch):
    from shared.models import ModelSeries as MS
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": MS(available=False), "gfs": _good_series(), "ecmwf": _good_series()}))

    main.handle_message(_event({"mountainId": "mt-rainier", "reason": "scheduled"}))

    patched.upsert_mountain_conditions.assert_called_once()  # still writes
    patched.write_mountain_snapshot.assert_called_once()


def test_all_models_fail_no_blob_and_raises(patched, monkeypatch):
    monkeypatch.setattr(main.omc, "fetch_forecast",
                        AsyncMock(side_effect=main.omc.OpenMeteoError("Invalid timezone")))

    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier", "reason": "scheduled"}))

    patched.write_combined_blob.assert_not_called()
    patched.upsert_mountain_conditions.assert_not_called()
    patched.write_mountain_snapshot.assert_not_called()


def test_browse_conditions_use_today(patched, monkeypatch):
    """mountainConditions (browse) summarizes TODAY's hours -> populated."""
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).date().isoformat()
    series = ModelSeries(
        time=[f"{today}T00:00", f"{today}T12:00"],
        temperature_2m=[10.0, 25.0], wind_speed_10m=[5.0, 8.0],
        wind_gusts_10m=[20.0, 30.0], precipitation=[0.0, 0.0], snowfall=[0.0, 0.0],
        freezing_level_height=[6000.0, 6500.0], temp_summit_f=[8.0, 20.0])
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": series, "gfs": series, "ecmwf": series}))

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    cond_summary = patched.upsert_mountain_conditions.call_args.args[2]
    assert cond_summary["targetDateHigh"] is not None


def test_unknown_mountain_raises(patched):
    patched.get_mountain.return_value = None
    with pytest.raises(ValueError, match="Unknown mountain"):
        main.handle_message(_event({"mountainId": "nope", "reason": "manual"}))


def test_weather_emits_pipeline_success(patched, monkeypatch, capsys):
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": _good_series(), "gfs": _good_series(), "ecmwf": _good_series()}))

    main.handle_message(_event({"mountainId": "mt-rainier", "reason": "manual"}))

    evt = _find_event(capsys, "pipeline_success")
    assert evt is not None
    assert evt["severity"] == "INFO"
    assert evt["source"] == "weather"
    assert evt["mountainId"] == "mt-rainier"


def test_weather_emits_pipeline_error_before_reraise(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoError("Invalid timezone")

    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)

    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier", "reason": "scheduled"}))

    evt = _find_event(capsys, "pipeline_error")
    assert evt is not None
    assert evt["severity"] == "ERROR"
    assert evt["source"] == "weather"
    assert evt["mountainId"] == "mt-rainier"


def test_sustained_wind_and_gust_scored_distinctly():
    # B1: sustained wind low (25) but gusts high (50). Sustained 25 must NOT score the
    # 2 wind points the old code gave by passing the gust max as max_wind. With no other
    # drivers the tone stays "good" (sustained 25<=32 -> 0, gust 50<=55 -> 0).
    from shared.models import CombinedForecastBlob
    series = ModelSeries(
        time=["2026-08-02T00:00", "2026-08-02T12:00"],
        temperature_2m=[30.0, 40.0],
        wind_speed_10m=[20.0, 25.0],      # sustained max 25
        wind_gusts_10m=[40.0, 50.0],      # gust max 50
        precipitation=[0.0, 0.0], snowfall=[0.0, 0.0],
        freezing_level_height=[6000.0, 6500.0], temp_summit_f=[30.0, 40.0])
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z", gfs=series)
    cs = main._summary_for(blob, "2026-08-02", summit_ft=14410, nwac_danger=None)
    assert cs.tone == "good"
    assert cs.verdict == "Favorable window on the summit"


def test_pipeline_error_timeout_is_transient(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoUnavailable("read timeout")
    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)
    with pytest.raises(main.omc.OpenMeteoUnavailable):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
    assert evt["error"] == "read timeout"  # non-blank


def test_pipeline_error_throttle_is_transient(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoThrottled("Too many concurrent requests")
    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)
    with pytest.raises(main.omc.OpenMeteoThrottled):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"


def test_pipeline_error_bad_params_is_actionable(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoError("Invalid timezone")
    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)
    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "actionable"


def test_pipeline_error_no_usable_models_is_transient(patched, monkeypatch, capsys):
    unavailable = ModelSeries(available=False)
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": unavailable, "gfs": unavailable, "ecmwf": unavailable}))
    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
    assert evt["error"]  # non-blank


def test_unexpected_exception_logs_actionable(patched, monkeypatch, capsys):
    # Unknown mountain -> ValueError inside _handle -> caught by the actionable catch-all.
    patched.get_mountain.return_value = None
    with pytest.raises(ValueError, match="Unknown mountain"):
        main.handle_message(_event({"mountainId": "nope"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt is not None
    assert evt["errorClass"] == "actionable"
    assert evt["error"]  # non-blank
