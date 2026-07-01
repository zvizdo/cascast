import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from snotel_worker import main


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


@pytest.fixture
def snotel_data(load_fixture):
    from snotel_worker import snotel_client
    fixture = load_fixture("snotel.json")
    station = snotel_client.parse_stations(fixture["stations"])["679:WA:SNTL"]
    return snotel_client.parse_data(fixture["data"], station_id="679", station=station)


def test_handle_message_writes_snotel_data(monkeypatch, snotel_data):
    doc_ref = MagicMock()
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref

    monkeypatch.setattr(main.fc, "get_mountain", lambda mid: {
        "id": "mt-rainier",
        "snotelStationId": "679",
        "snotelStationTriplet": "679:WA:SNTL",
    })
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_snotel", lambda sid, triplet: snotel_data)

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    # snotelData is keyed by the resolved mountain id
    db.collection.assert_called_once_with("snotelData")
    db.collection.return_value.document.assert_called_once_with("mt-rainier")

    assert doc_ref.set.called
    written = doc_ref.set.call_args[0][0]
    assert written["stationId"] == "679"
    assert "fetchedAt" in written

    # never touch the projects collection
    assert all(
        call.args[0] != "projects" for call in db.collection.call_args_list
    )


def test_handle_message_banks_per_day_history(monkeypatch, snotel_data):
    """One idempotent history doc per reading date across the whole window."""
    doc_ref = MagicMock()
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref

    monkeypatch.setattr(main.fc, "get_mountain", lambda mid: {
        "id": "mt-rainier",
        "snotelStationId": "679",
        "snotelStationTriplet": "679:WA:SNTL",
    })
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_snotel", lambda sid, triplet: snotel_data)

    appended = []
    monkeypatch.setattr(
        main.fc, "append_history",
        lambda coll, mid, key, rec: appended.append((coll, mid, key, rec)),
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    # one append per distinct reading date (trend + current)
    expected_dates = {r.date for r in snotel_data.trend} | {snotel_data.current.date}
    keys = {key for (_c, _m, key, _r) in appended}
    assert keys == expected_dates
    assert all(c == "snotelData" and m == "mt-rainier" for (c, m, _k, _r) in appended)
    # each history doc carries station meta at top level + the per-day reading nested
    for (_c, _m, _k, rec) in appended:
        assert rec["stationId"] == "679"
        assert rec["reading"]["date"] in expected_dates


def test_handle_message_unknown_mountain_is_noop(monkeypatch):
    db = MagicMock()
    monkeypatch.setattr(main.fc, "get_mountain", lambda mid: None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_snotel", lambda sid, triplet: (_ for _ in ()).throw(
        AssertionError("fetch_snotel must not be called for unknown mountain")
    ))

    main.handle_message(_event({"mountainId": "nope"}))

    db.collection.assert_not_called()


def test_handle_message_no_station_is_noop(monkeypatch):
    mountain = {"id": "mt-whitney", "snotelStationId": "", "snotelStationTriplet": ""}
    monkeypatch.setattr(main.fc, "get_mountain", lambda _id: mountain)
    db = MagicMock()
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_snotel", lambda sid, triplet: (_ for _ in ()).throw(
        AssertionError("fetch_snotel must not be called when no SNOTEL station")
    ))

    main.handle_message(_event({"mountainId": "mt-whitney"}))

    db.collection.assert_not_called()


def test_decode_extracts_mountain_id():
    assert main._decode(_event({"mountainId": "mt-rainier"})) == {"mountainId": "mt-rainier"}


def _snotel_data():
    from shared.models import SnotelData, SnotelReading
    rd = lambda d: SnotelReading(date=d, sweIn=10.0, snowDepthIn=20.0)
    return SnotelData(
        stationId="909", stationTriplet="909:WA:SNTL", stationName="Paradise",
        elevationFt=5400, lat=46.78, lng=-121.74,
        current=rd("2026-06-17"), trend=[rd("2026-06-15"), rd("2026-06-16"), rd("2026-06-17")],
    )


def test_snotel_banks_per_day_history(monkeypatch, capsys):
    mountain = {"id": "mt-rainier", "snotelStationId": "909", "snotelStationTriplet": "909:WA:SNTL"}
    monkeypatch.setattr(main.fc, "get_mountain", lambda mid: mountain)
    monkeypatch.setattr(main, "fetch_snotel", lambda sid, trip: _snotel_data())
    db = MagicMock()
    monkeypatch.setattr(main, "get_db", lambda: db)
    appended = []
    monkeypatch.setattr(main.fc, "append_history", lambda coll, mid, key, rec: appended.append((coll, mid, key)))

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    keys = {k for (_c, _m, k) in appended}
    assert keys == {"2026-06-15", "2026-06-16", "2026-06-17"}
    assert all(c == "snotelData" and m == "mt-rainier" for (c, m, _k) in appended)
    out = capsys.readouterr().out
    assert any('"event": "pipeline_success"' in l and '"source": "snotel"' in l for l in out.splitlines())


def test_snotel_emits_error_before_reraise(monkeypatch, capsys):
    mountain = {"id": "mt-rainier", "snotelStationId": "909", "snotelStationTriplet": "909:WA:SNTL"}
    monkeypatch.setattr(main.fc, "get_mountain", lambda mid: mountain)
    def _boom(sid, trip):
        raise RuntimeError("SNOTEL 503")
    monkeypatch.setattr(main, "fetch_snotel", _boom)
    monkeypatch.setattr(main, "get_db", lambda: MagicMock())
    with pytest.raises(RuntimeError):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    lines = capsys.readouterr().out.splitlines()
    assert any('"event": "pipeline_error"' in l and '"source": "snotel"' in l for l in lines)


def test_fetch_snotel_wraps_async_client(monkeypatch, snotel_data, load_fixture):
    from snotel_worker import snotel_client
    fixture = load_fixture("snotel.json")
    station = snotel_client.parse_stations(fixture["stations"])["679:WA:SNTL"]

    async def fake_station(triplet):
        return station

    async def fake_data(sid, triplet):
        return fixture["data"]

    monkeypatch.setattr(snotel_client, "fetch_station", fake_station)
    monkeypatch.setattr(snotel_client, "fetch_data", fake_data)

    result = main.fetch_snotel("679", "679:WA:SNTL")
    assert result.stationName == "Paradise"
    assert result.current.date == "2026-06-13"
