"""Satellite worker entry point (contract §2/§3, spec A5)."""
from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import functions_framework

from shared import obs
from shared.firestore_client import _db as get_db, append_history
from shared.models import SatelliteCache
from shared.storage_client import (
    write_satellite_metadata,
    write_satellite_image,
    write_satellite_image_history,
)
from satellite_worker import copernicus_client as cc

PACIFIC = ZoneInfo("America/Los_Angeles")
MAX_BACKFILL_RENDERS = 4   # bound CDSE Processing-API cost per run


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def fetch_scene(bbox: dict) -> dict | None:
    """Sync wrapper: catalog search for the latest <70%-cloud scene (contract §5.4)."""
    return asyncio.run(cc.search_latest_scene(bbox))


def render_scene_image(bbox: dict, date: str) -> bytes:
    """Sync wrapper around the async Processing-API render."""
    return asyncio.run(cc.render_scene_image(bbox, date))


def search_recent_scenes(bbox: dict) -> list[dict]:
    """Sync wrapper around the async trailing-window catalog search."""
    return asyncio.run(cc.search_recent_scenes(bbox))


@functions_framework.cloud_event
def handle_message(cloud_event) -> None:
    payload = _decode(cloud_event)
    mountain_id = str(payload["mountainId"])
    db = get_db()

    mountain_snap = db.collection("mountains").document(mountain_id).get()
    if not mountain_snap.exists:
        obs.log_event("WARNING", "pipeline_skip", source="satellite", mountainId=mountain_id, reason="mountain not found")
        return
    mountain = mountain_snap.to_dict()
    bbox = cc.bbox_for(mountain["lat"], mountain["lng"])

    # The worker must ALWAYS write the no-auth EOX layer (contract §5.4/§3); any CDSE
    # error or empty search degrades to a null scene badge rather than crashing.
    try:
        scene = fetch_scene(bbox)
    except Exception as exc:  # CDSE outage / 401 / transport error
        obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"CDSE lookup failed: {exc}")
        scene = None

    cache_ref = db.collection("satelliteCache").document(mountain_id)
    if scene is not None:
        # Render + store the scene image whenever a scene exists (idempotent and
        # self-healing after a failed render). Metadata is rewritten unconditionally
        # below so the stored attribution/scene always tracks the displayed image.
        try:
            jpeg = render_scene_image(bbox, scene["latestImageDate"])
            write_satellite_image(mountain_id, jpeg)
            write_satellite_image_history(mountain_id, scene["latestImageDate"], jpeg)
            obs.log_event("INFO", "pipeline_image", source="satellite", mountainId=mountain_id, scene=scene["latestImageDate"])
        except Exception as exc:  # Processing API outage / quota / transport
            obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"latest render failed: {exc}")

    # The displayed image is the real Copernicus Sentinel-2 L2A scene (rendered via the
    # CDSE Processing API), so credit Copernicus — NOT the EOX cloudless mosaic. The
    # EOX tileUrlTemplate/tileSource fields are retained for contract compatibility but
    # are no longer the display source. When no scene is found, fall back to EOX.
    attribution = (
        f"Contains modified Copernicus Sentinel-2 data {scene['latestImageDate'][:4]}, "
        "processed by Sentinel Hub (Copernicus Data Space Ecosystem)"
        if scene else cc.EOX_ATTRIBUTION
    )
    cache = SatelliteCache(
        mountainId=mountain_id,
        latestImageDate=scene["latestImageDate"] if scene else None,
        cloudCoverPercent=scene["cloudCoverPercent"] if scene else None,
        sceneId=scene["sceneId"] if scene else None,
        tileUrlTemplate=cc.eox_tile_template(),
        tileSource="eox-s2cloudless",
        attribution=attribution,
        boundingBox=bbox,
    )
    record = cache.model_dump(by_alias=True)
    record["updatedAt"] = datetime.now(tz=PACIFIC)
    cache_ref.set(record)
    write_satellite_metadata(mountain_id, record)
    if scene is not None:
        append_history("satelliteCache", mountain_id, scene["latestImageDate"], record)
        _backfill_window(db, mountain_id, bbox, record, newest_date=scene["latestImageDate"])
    obs.log_event("INFO", "pipeline_success", source="satellite", mountainId=mountain_id, scene=record["latestImageDate"])


def _backfill_window(db, mountain_id, bbox, base_record, newest_date) -> None:
    """Render+store any <70%-cloud scene-date in the trailing window not already in
    history (idempotent, capped). Self-heals gaps from prior failed runs."""
    try:
        recent = search_recent_scenes(bbox)
    except Exception as exc:
        obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"window search failed: {exc}")
        return
    hist_col = db.collection("satelliteCache").document(mountain_id).collection("history")
    seen, rendered, dropped = set(), 0, []
    for s in recent:
        d = s["latestImageDate"]
        if d == newest_date or d in seen:
            continue
        seen.add(d)
        if hist_col.document(d).get().exists:
            continue
        if rendered >= MAX_BACKFILL_RENDERS:
            dropped.append(d)
            continue
        try:
            jpeg = render_scene_image(bbox, d)
            write_satellite_image_history(mountain_id, d, jpeg)
            rec = {
                **base_record,
                "latestImageDate": d,
                "cloudCoverPercent": s["cloudCoverPercent"],
                "sceneId": s["sceneId"],
                "attribution": f"Contains modified Copernicus Sentinel-2 data {d[:4]}, "
                               "processed by Sentinel Hub (Copernicus Data Space Ecosystem)",
            }
            append_history("satelliteCache", mountain_id, d, rec)
            rendered += 1
        except Exception as exc:
            obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"backfill render {d} failed: {exc}")
    if dropped:
        obs.log_event("WARNING", "pipeline_backfill_capped", source="satellite", mountainId=mountain_id, dropped=dropped)
