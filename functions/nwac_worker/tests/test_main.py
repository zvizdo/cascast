import base64
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from nwac_worker import main


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


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


@pytest.fixture
def winter_forecast(load_fixture):
    from nwac_worker import nwac_client
    return nwac_client.parse_product(load_fixture("nwac_winter.json"))


def _mountain(zone_id="1648"):
    return {"id": "mt-rainier", "nwacZoneId": zone_id, "nwacZone": "west-slopes-south"}


def test_already_captured_today_is_noop(monkeypatch, winter_forecast):
    today = datetime.now(main.PACIFIC).date().isoformat()
    existing = MagicMock()
    existing.exists = True
    existing.to_dict.return_value = {
        "productType": "forecast",
        "publishedTime": datetime(2026, 1, 15, 15, 30, tzinfo=timezone.utc),
        "forecastDate": today,
    }
    doc_ref = MagicMock()
    doc_ref.get.return_value = existing
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    called = {"fetched": False}
    async def fake_fetch(zone_id):
        called["fetched"] = True
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert called["fetched"] is False
    doc_ref.set.assert_not_called()


def test_unknown_mountain_is_noop(monkeypatch, winter_forecast):
    db = MagicMock()
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: None)

    called = {"fetched": False}
    async def fake_fetch(zone_id):
        called["fetched"] = True
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"mountainId": "nope"}))

    assert called["fetched"] is False
    db.collection.assert_not_called()


def test_fresh_capture_writes_only_nwac_forecast(monkeypatch, winter_forecast):
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing

    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    async def fake_fetch(zone_id):
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert forecast_ref.set.called
    db.collection.assert_called_once_with("nwacForecasts")
    db.collection.return_value.document.assert_called_with("1648")
    written = forecast_ref.set.call_args[0][0]
    assert written["zoneId"] == "1648"
    assert written["season"] == "winter"
    assert "fetchedAt" in written

    # New model: nwac worker never touches the projects collection.
    collection_names = [c.args[0] for c in db.collection.call_args_list]
    assert "projects" not in collection_names


def test_fresh_capture_appends_history_keyed_by_forecast_date(monkeypatch, winter_forecast):
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    async def fake_fetch(zone_id):
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    appended = {}
    monkeypatch.setattr(
        main.fc, "append_history",
        lambda coll, zid, key, rec: appended.update(coll=coll, zid=zid, key=key, rec=rec),
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert appended["coll"] == "nwacForecasts"
    assert appended["zid"] == "1648"
    assert appended["key"] == winter_forecast.forecastDate
    assert appended["rec"]["zoneId"] == "1648"


def test_history_key_falls_back_to_today_when_forecast_date_missing(monkeypatch, winter_forecast):
    winter_forecast.forecastDate = ""
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    async def fake_fetch(zone_id):
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    appended = {}
    monkeypatch.setattr(
        main.fc, "append_history",
        lambda coll, zid, key, rec: appended.update(key=key),
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert appended["key"] == datetime.now(main.PACIFIC).date().isoformat()


def test_summer_capture_writes_nwac_forecast(monkeypatch, load_fixture):
    from nwac_worker import nwac_client
    summer = nwac_client.parse_product(load_fixture("nwac_summer.json"))
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    async def fake_fetch(z):
        return summer
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    written = forecast_ref.set.call_args[0][0]
    assert written["season"] == "summer"
    collection_names = [c.args[0] for c in db.collection.call_args_list]
    assert "projects" not in collection_names


def test_no_zone_is_noop(monkeypatch):
    mountain = {"id": "mt-whitney", "nwacZoneId": ""}
    monkeypatch.setattr(main.fc, "get_mountain", lambda _id: mountain)
    db = MagicMock()
    monkeypatch.setattr(main, "get_db", lambda: db)

    async def fake_fetch(zone_id):
        raise AssertionError("fetch_forecast must not be called when no NWAC zone")
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"mountainId": "mt-whitney"}))

    db.collection.assert_not_called()


def test_nwac_emits_success_on_capture(monkeypatch, winter_forecast, capsys):
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    async def fake_fetch(zone_id):
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    evt = _find_event(capsys, "pipeline_success")
    assert evt is not None
    assert evt["severity"] == "INFO"
    assert evt["source"] == "nwac"
    assert evt["mountainId"] == "mt-rainier"


def test_nwac_emits_error_before_reraise(monkeypatch, capsys):
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())

    async def _boom(zone):
        raise RuntimeError("avalanche.org 503")
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", _boom)

    with pytest.raises(RuntimeError):
        main.handle_message(_event({"mountainId": "mt-rainier"}))

    evt = _find_event(capsys, "pipeline_error")
    assert evt is not None
    assert evt["severity"] == "ERROR"
    assert evt["source"] == "nwac"
    assert evt["mountainId"] == "mt-rainier"


def test_nwac_pipeline_error_has_errorclass(monkeypatch, capsys):
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main.fc, "get_mountain", lambda slug: _mountain())
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", AsyncMock(side_effect=TimeoutError("read timeout")))

    with pytest.raises(TimeoutError):
        main.handle_message(_event({"mountainId": "mt-baker"}))

    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"


def test_decode_message_extracts_mountain_id():
    assert main._decode(_event({"mountainId": "mt-rainier"})) == {"mountainId": "mt-rainier"}


def test_published_date_pacific_parses_iso_string():
    # 2026-01-15T15:30Z -> 07:30 Pacific same day
    assert main._published_date_pacific("2026-01-15T15:30:00Z") == "2026-01-15"
