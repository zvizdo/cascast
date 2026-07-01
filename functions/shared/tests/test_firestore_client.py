from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import shared.firestore_client as fc


def _doc(data, exists=True, id_="x"):
    d = MagicMock()
    d.exists = exists
    d.to_dict.return_value = data
    d.id = id_
    return d


def test_get_mountain_returns_dict_with_id(monkeypatch):
    snap = _doc({"slug": "mt-rainier", "timezone": "America/Los_Angeles"}, id_="mt-rainier")
    ref = MagicMock(); ref.get.return_value = snap
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    m = fc.get_mountain("mt-rainier")
    db.collection.assert_called_once_with("mountains")
    coll.document.assert_called_once_with("mt-rainier")
    assert m["id"] == "mt-rainier"
    assert m["timezone"] == "America/Los_Angeles"


def test_get_mountain_missing_returns_none(monkeypatch):
    ref = MagicMock(); ref.get.return_value = _doc(None, exists=False)
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)
    assert fc.get_mountain("nope") is None


def test_upsert_mountain_conditions_merges_doc(monkeypatch):
    ref = MagicMock()
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    fc.upsert_mountain_conditions("mt-rainier", "forecasts/x.json", {"tone": "good"})
    db.collection.assert_called_once_with("mountainConditions")
    coll.document.assert_called_once_with("mt-rainier")
    payload, kwargs = ref.set.call_args.args[0], ref.set.call_args.kwargs
    assert payload["mountainId"] == "mt-rainier"
    assert payload["forecastBlobPath"] == "forecasts/x.json"
    assert payload["currentSummary"] == {"tone": "good"}
    assert "updatedAt" in payload
    assert kwargs == {"merge": True}


def test_write_mountain_snapshot_sets_expire_at_35d(monkeypatch):
    add_ref = MagicMock()
    subcoll = MagicMock(); subcoll.add.return_value = (None, add_ref)
    mtn_ref = MagicMock(); mtn_ref.collection.return_value = subcoll
    coll = MagicMock(); coll.document.return_value = mtn_ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    before = datetime.now(timezone.utc)
    fc.write_mountain_snapshot("mt-rainier", blob_path="forecasts/mt-rainier.json",
                               models={"gfs": {"available": True}})
    db.collection.assert_called_once_with("mountains")
    mtn_ref.collection.assert_called_once_with("snapshots")
    payload = subcoll.add.call_args.args[0]
    assert payload["forecastBlobPath"] == "forecasts/mt-rainier.json"
    assert payload["models"] == {"gfs": {"available": True}}
    delta = payload["expireAt"] - before
    assert timedelta(days=34, hours=23) < delta < timedelta(days=35, hours=1)


def test_append_history_writes_dated_record_with_ttl(monkeypatch):
    hist_ref = MagicMock()
    hist_coll = MagicMock(); hist_coll.document.return_value = hist_ref
    parent_ref = MagicMock(); parent_ref.collection.return_value = hist_coll
    coll = MagicMock(); coll.document.return_value = parent_ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    before = datetime.now(timezone.utc)
    fc.append_history("snotelData", "mt-rainier", "2026-06-13", {"stationId": "679"})

    # path: snotelData/mt-rainier/history/2026-06-13
    db.collection.assert_called_once_with("snotelData")
    coll.document.assert_called_once_with("mt-rainier")
    parent_ref.collection.assert_called_once_with("history")
    hist_coll.document.assert_called_once_with("2026-06-13")

    payload = hist_ref.set.call_args.args[0]
    assert payload["stationId"] == "679"
    assert payload["expireAt"].tzinfo is not None
    delta = payload["expireAt"] - before
    assert timedelta(days=34, hours=23) < delta < timedelta(days=35, hours=1)


def test_all_mountain_ids_lists_doc_ids(monkeypatch):
    snaps = [_doc({}, id_="mt-rainier"), _doc({}, id_="mt-baker")]
    coll = MagicMock(); coll.stream.return_value = iter(snaps)
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)
    assert fc.all_mountain_ids() == ["mt-rainier", "mt-baker"]


def test_db_uses_named_database_via_gcf_client(monkeypatch):
    # A named database (e.g. "dev-db") is served by a google-cloud-firestore
    # Client built with the app's project/credentials + database= kwarg.
    import firebase_admin
    from google.cloud import firestore as gcf
    fc._db_client = None
    monkeypatch.setenv("FIRESTORE_DATABASE", "dev-db")
    fake_app = MagicMock()
    fake_app.project_id = "proj-x"
    monkeypatch.setattr(firebase_admin, "_apps", {"x": object()})
    monkeypatch.setattr(firebase_admin, "get_app", lambda: fake_app)
    client_mock = MagicMock()
    monkeypatch.setattr(gcf, "Client", client_mock)
    fc._db()
    _, kwargs = client_mock.call_args
    assert kwargs["database"] == "dev-db"
    assert kwargs["project"] == "proj-x"
    fc._db_client = None


def test_db_uses_default_when_env_unset(monkeypatch):
    import firebase_admin
    from firebase_admin import firestore
    fc._db_client = None
    monkeypatch.delenv("FIRESTORE_DATABASE", raising=False)
    monkeypatch.setattr(firebase_admin, "_apps", {"x": object()})
    client_mock = MagicMock()
    monkeypatch.setattr(firestore, "client", client_mock)
    fc._db()
    client_mock.assert_called_once_with()
    fc._db_client = None


def test_db_uses_default_when_env_is_default_literal(monkeypatch):
    import firebase_admin
    from firebase_admin import firestore
    fc._db_client = None
    monkeypatch.setenv("FIRESTORE_DATABASE", "(default)")
    monkeypatch.setattr(firebase_admin, "_apps", {"x": object()})
    client_mock = MagicMock()
    monkeypatch.setattr(firestore, "client", client_mock)
    fc._db()
    client_mock.assert_called_once_with()
    fc._db_client = None


def test_gcf_client_actually_accepts_database_kwarg():
    # Guard against the exact bug we hit live: firebase-admin 6.5.0's
    # firestore.client() has no database id, so the named-DB path relies on
    # google-cloud-firestore's Client accepting `database`. If a dependency bump
    # ever removes it, fail here in unit tests rather than at deploy time.
    import inspect
    from google.cloud import firestore as gcf
    assert "database" in inspect.signature(gcf.Client.__init__).parameters
