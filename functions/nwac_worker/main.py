"""NWAC worker entry point — idempotent daily capture (spec §3, contract §2/§3)."""
from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import functions_framework

from shared import firestore_client as fc
from shared import obs
from shared.firestore_client import _db as get_db
from nwac_worker import nwac_client

PACIFIC = ZoneInfo("America/Los_Angeles")


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def _today_pacific() -> str:
    return datetime.now(PACIFIC).date().isoformat()


def _published_date_pacific(value) -> str:
    if isinstance(value, str):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        dt = value
    return dt.astimezone(PACIFIC).date().isoformat()


def _already_captured_today(snapshot) -> bool:
    """True if today's forecast/summary is already stored (spec §3).

    Idempotency keys on the Pacific date we *captured* for: ``fetchedAt`` (the
    wall-clock time we wrote the doc) is the authoritative signal, with
    ``forecastDate`` as a fallback. ``publishedTime`` is NOT used — off-season
    the last published product may be weeks old, so a doc captured today can
    carry a stale ``publishedTime``.
    """
    if not snapshot.exists:
        return False
    data = snapshot.to_dict() or {}
    today = _today_pacific()
    fetched = data.get("fetchedAt")
    if fetched is not None and _published_date_pacific(fetched) == today:
        return True
    return data.get("forecastDate") == today


@functions_framework.cloud_event
def handle_message(cloud_event) -> None:
    payload = _decode(cloud_event)
    mountain = fc.get_mountain(payload["mountainId"])
    if not mountain:
        print(f"nwac_worker: unknown mountain {payload['mountainId']}, skipping")
        return
    zone_id = str(mountain["nwacZoneId"])
    if not zone_id:
        print(f"nwac_worker: mountain {mountain['id']} has no NWAC zone, skipping")
        return
    db = get_db()
    doc_ref = db.collection("nwacForecasts").document(zone_id)

    if _already_captured_today(doc_ref.get()):
        print(f"nwac_worker: zone {zone_id} already captured today, skipping")
        return

    try:
        forecast = asyncio.run(nwac_client.fetch_forecast(zone_id))
    except Exception as exc:
        obs.log_event("ERROR", "pipeline_error", source="nwac", mountainId=mountain["id"],
                      error=str(exc) or repr(exc), errorClass=obs.classify_exception(exc))
        raise  # let Pub/Sub retry -> DLQ

    record = forecast.model_dump(by_alias=True)
    record["fetchedAt"] = datetime.now(tz=PACIFIC)
    doc_ref.set(record)

    history_key = record.get("forecastDate") or _today_pacific()
    fc.append_history("nwacForecasts", zone_id, history_key, record)

    obs.log_event("INFO", "pipeline_success", source="nwac", mountainId=mountain["id"])
    print(f"nwac_worker: captured zone {zone_id} ({forecast.season})")
