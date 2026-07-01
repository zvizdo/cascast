import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from satellite_worker import main


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


def _db_with_mountain(existing_cache=None, history_dates=()):
    mountain_doc = MagicMock()
    mountain_doc.exists = True
    mountain_doc.to_dict.return_value = {"lat": 46.8517, "lng": -121.7603, "slug": "mt-rainier"}

    cache_doc = MagicMock()
    cache_doc.exists = existing_cache is not None
    cache_doc.to_dict.return_value = existing_cache or {}
    cache_ref = MagicMock()
    cache_ref.get.return_value = cache_doc

    def history_doc(date):
        d = MagicMock()
        hist = MagicMock()
        hist.exists = date in history_dates
        d.get.return_value = hist
        return d

    history_col = MagicMock()
    history_col.document.side_effect = history_doc
    cache_ref.collection.return_value = history_col

    db = MagicMock()

    def collection(name):
        col = MagicMock()
        if name == "mountains":
            col.document.return_value.get.return_value = mountain_doc
        else:  # satelliteCache
            col.document.return_value = cache_ref
        return col

    db.collection.side_effect = collection
    return db, cache_ref


def test_writes_cache_for_new_scene(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-09", "cloudCoverPercent": 12.4},
    )
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert cache_ref.set.called
    written = cache_ref.set.call_args[0][0]
    assert written["mountainId"] == "mt-rainier"
    assert written["latestImageDate"] == "2026-06-09"
    assert written["cloudCoverPercent"] == 12.4
    # Displayed image is real Copernicus Sentinel-2 data, so credit Copernicus (year from scene).
    assert "Copernicus Sentinel-2 data 2026" in written["attribution"]
    assert "EOX" not in written["attribution"]
    assert written["tileSource"] == "eox-s2cloudless"
    assert "{z}/{y}/{x}" in written["tileUrlTemplate"]
    assert written["boundingBox"]["north"] > written["boundingBox"]["south"]


def test_rewrites_metadata_and_image_for_unchanged_scene(monkeypatch):
    # Even when the stored scene date is unchanged, the worker rewrites metadata and
    # re-renders the image so the stored attribution/scene always tracks the display.
    db, cache_ref = _db_with_mountain(existing_cache={"latestImageDate": "2026-06-09"})
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-09", "cloudCoverPercent": 5.0},
    )
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMGBYTES")
    stored: dict = {}
    monkeypatch.setattr(
        main, "write_satellite_image",
        lambda mid, jpeg: stored.update(mid=mid, jpeg=jpeg) or "p",
    )
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: "p")
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])

    main.handle_message(_event({"mountainId": "mt-rainier"}))
    assert cache_ref.set.called
    assert stored == {"mid": "mt-rainier", "jpeg": b"IMGBYTES"}


def test_no_scene_found_writes_eox_with_null_badge(monkeypatch):
    # B2: empty CDSE search must still write the EOX layer with null scene fields.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: None)
    written_meta = {}
    monkeypatch.setattr(
        main, "write_satellite_metadata",
        lambda mid, rec: written_meta.update({"id": mid, "rec": rec}) or "mt-rainier/metadata.json",
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert cache_ref.set.called
    written = cache_ref.set.call_args[0][0]
    assert written["mountainId"] == "mt-rainier"
    assert written["latestImageDate"] is None
    assert written["cloudCoverPercent"] is None
    assert written["sceneId"] is None
    assert written["tileSource"] == "eox-s2cloudless"
    assert "{z}/{y}/{x}" in written["tileUrlTemplate"]
    assert written["boundingBox"]["north"] > written["boundingBox"]["south"]
    # B3: GCS metadata.json mirror is written too.
    assert written_meta["id"] == "mt-rainier"


def test_cdse_error_writes_eox_with_null_badge(monkeypatch):
    # B2: a CDSE outage/401 (fetch_scene raises) must degrade to EOX layer, not crash.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)

    def boom(bbox):
        raise RuntimeError("CDSE 401")

    monkeypatch.setattr(main, "fetch_scene", boom)
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert cache_ref.set.called
    written = cache_ref.set.call_args[0][0]
    assert written["latestImageDate"] is None
    assert written["sceneId"] is None
    assert written["tileSource"] == "eox-s2cloudless"


def test_metadata_mirror_called_after_firestore_write(monkeypatch):
    # B3: satelliteCache record is mirrored to GCS metadata.json.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-09", "cloudCoverPercent": 12.4},
    )
    calls = {}
    monkeypatch.setattr(
        main, "write_satellite_metadata",
        lambda mid, rec: calls.update({"id": mid, "rec": rec}) or "mt-rainier/metadata.json",
    )
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert calls["id"] == "mt-rainier"
    assert calls["rec"]["latestImageDate"] == "2026-06-09"
    assert calls["rec"]["sceneId"] == "S2X"


def test_handle_message_renders_and_stores_image(monkeypatch):
    # P11: on a fresh scene the worker renders + stores the true-color JPEG.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0},
    )
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMGBYTES")
    calls = {}
    monkeypatch.setattr(
        main, "write_satellite_image",
        lambda mid, jpeg: calls.update(mid=mid, jpeg=jpeg) or f"{mid}/scene.jpg",
    )
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: "p")
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert calls["mid"] == "mt-rainier"
    assert calls["jpeg"] == b"IMGBYTES"


def test_handle_message_appends_history_and_image_for_scene(monkeypatch):
    # New: a found scene appends a dated Firestore history record (keyed by the scene
    # date) AND a dated GCS history image.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0},
    )
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMGBYTES")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")

    appended = {}
    monkeypatch.setattr(
        main, "append_history",
        lambda coll, mid, key, rec: appended.update(coll=coll, mid=mid, key=key, rec=rec),
    )
    img_hist = {}
    monkeypatch.setattr(
        main, "write_satellite_image_history",
        lambda mid, date, jpeg: img_hist.update(mid=mid, date=date, jpeg=jpeg) or "p",
    )
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert appended["coll"] == "satelliteCache"
    assert appended["mid"] == "mt-rainier"
    assert appended["key"] == "2026-06-13"
    assert appended["rec"]["latestImageDate"] == "2026-06-13"
    assert img_hist == {"mid": "mt-rainier", "date": "2026-06-13", "jpeg": b"IMGBYTES"}


def test_handle_message_no_scene_skips_history(monkeypatch):
    # Graceful degradation: no scene => no Firestore history, no image history.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: None)
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")

    appended = {"called": False}
    monkeypatch.setattr(
        main, "append_history",
        lambda *a, **k: appended.update(called=True),
    )
    img_hist = {"called": False}
    monkeypatch.setattr(
        main, "write_satellite_image_history",
        lambda *a, **k: img_hist.update(called=True) or "p",
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert appended["called"] is False
    assert img_hist["called"] is False


def test_handle_message_image_render_failure_is_graceful(monkeypatch):
    # P11: a Processing-API failure must NOT raise; metadata write still happened.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0},
    )
    meta = {}
    monkeypatch.setattr(
        main, "write_satellite_metadata",
        lambda mid, rec: meta.update(called=True) or "p",
    )

    def _boom(bbox, date):
        raise RuntimeError("processing 500")

    monkeypatch.setattr(main, "render_scene_image", _boom)
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])

    # Does not raise.
    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert cache_ref.set.called
    assert meta["called"] is True


def test_handle_message_no_scene_skips_image(monkeypatch):
    # P11: when no scene is found, no image render is attempted.
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: None)
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    rendered = {"called": False}
    monkeypatch.setattr(
        main, "render_scene_image",
        lambda bbox, date: rendered.update(called=True) or b"",
    )
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert rendered["called"] is False


def test_decode_extracts_mountain_id():
    assert main._decode(_event({"mountainId": "mt-rainier"})) == {"mountainId": "mt-rainier"}


def test_backfill_renders_only_missing_in_window(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None, history_dates={"2026-06-08"})
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0})
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMG")
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [
        {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0},
        {"sceneId": "S2A", "latestImageDate": "2026-06-08", "cloudCoverPercent": 8.0},
        {"sceneId": "S2B", "latestImageDate": "2026-06-03", "cloudCoverPercent": 9.0},
    ])
    appended, imgs = [], []
    monkeypatch.setattr(main, "append_history", lambda coll, mid, key, rec: appended.append(key))
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: imgs.append(date) or "p")
    main.handle_message(_event({"mountainId": "mt-rainier"}))
    assert "2026-06-03" in appended and "2026-06-08" not in appended
    assert "2026-06-13" in appended   # latest path still appends its own history
    assert imgs.count("2026-06-03") == 1


def test_backfill_respects_render_cap(monkeypatch, capsys):
    db, cache_ref = _db_with_mountain(existing_cache=None, history_dates=set())
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: {"sceneId": "S2N", "latestImageDate": "2026-06-30", "cloudCoverPercent": 1.0})
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMG")
    older = [{"sceneId": f"S{i}", "latestImageDate": f"2026-06-{i:02d}", "cloudCoverPercent": 2.0} for i in (25, 20, 15, 10, 5, 1)]
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [
        {"sceneId": "S2N", "latestImageDate": "2026-06-30", "cloudCoverPercent": 1.0}, *older])
    rendered = []
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: rendered.append(date) or "p")
    monkeypatch.setattr(main, "append_history", lambda *a, **k: None)
    main.handle_message(_event({"mountainId": "mt-rainier"}))
    # `rendered` also captures the latest-scene render (newest_date) via the shared
    # image-history hook; the backfill itself must render exactly the cap.
    backfilled = [d for d in rendered if d != "2026-06-30"]
    assert len(backfilled) == main.MAX_BACKFILL_RENDERS
    assert any('"event": "pipeline_backfill_capped"' in l for l in capsys.readouterr().out.splitlines())


def test_no_scene_skips_backfill(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: None)
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    called = {"n": 0}
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: called.update(n=called["n"] + 1) or [])
    main.handle_message(_event({"mountainId": "mt-rainier"}))
    assert called["n"] == 0


def test_cdse_error_emits_pipeline_error(monkeypatch, capsys):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: (_ for _ in ()).throw(RuntimeError("CDSE 401")))
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    main.handle_message(_event({"mountainId": "mt-rainier"}))   # must not raise
    lines = capsys.readouterr().out.splitlines()
    assert any('"event": "pipeline_error"' in l and '"source": "satellite"' in l for l in lines)


def test_backfill_crosses_async_boundary(monkeypatch):
    # Regression: _backfill_window must asyncio.run the async cc.search_recent_scenes.
    # Patch the ASYNC client fn (not the sync wrapper) so the real boundary is crossed.
    db, cache_ref = _db_with_mountain(existing_cache=None, history_dates=set())
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0})
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMG")

    async def _recent(bbox):
        return [
            {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0},
            {"sceneId": "S2O", "latestImageDate": "2026-06-03", "cloudCoverPercent": 9.0},
        ]
    monkeypatch.setattr(main.cc, "search_recent_scenes", _recent)  # async, NOT the wrapper
    imgs = []
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: imgs.append(date) or "p")
    monkeypatch.setattr(main, "append_history", lambda *a, **k: None)

    main.handle_message(_event({"mountainId": "mt-rainier"}))  # must NOT raise
    # The older scene is backfilled via the real asyncio.run boundary (the latest
    # scene's own image-history write at "2026-06-13" is also captured here).
    assert "2026-06-03" in imgs


def test_satellite_emits_pipeline_success(monkeypatch, capsys):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0})
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMG")
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: "p")
    monkeypatch.setattr(main, "append_history", lambda *a, **k: None)
    monkeypatch.setattr(main, "search_recent_scenes", lambda bbox: [])
    main.handle_message(_event({"mountainId": "mt-rainier"}))
    assert any('"event": "pipeline_success"' in l and '"source": "satellite"' in l for l in capsys.readouterr().out.splitlines())
