"""SNOTEL worker entry point (contract §2/§3)."""
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
from shared.models import SnotelData
from snotel_worker import snotel_client

PACIFIC = ZoneInfo("America/Los_Angeles")


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def fetch_snotel(station_id: str, triplet: str) -> SnotelData:
    """Fetch station meta + data and parse into SnotelData (sync wrapper over async client)."""
    async def _run() -> SnotelData:
        station = await snotel_client.fetch_station(triplet)
        raw = await snotel_client.fetch_data(station_id, triplet)
        return snotel_client.parse_data(raw, station_id=station_id, station=station)
    return asyncio.run(_run())


@functions_framework.cloud_event
def handle_message(cloud_event) -> None:
    payload = _decode(cloud_event)
    mountain = fc.get_mountain(payload["mountainId"])
    if not mountain:
        print(f"snotel_worker: unknown mountain {payload['mountainId']}, skipping")
        return

    station_id = str(mountain["snotelStationId"])
    triplet = str(mountain["snotelStationTriplet"])

    if not triplet:
        print(f"snotel_worker: mountain {mountain['id']} has no SNOTEL station, skipping")
        return

    try:
        data = fetch_snotel(station_id, triplet)
    except Exception as exc:
        obs.log_event("ERROR", "pipeline_error", source="snotel", mountainId=mountain["id"],
                      error=str(exc) or repr(exc), errorClass=obs.classify_exception(exc))
        raise

    record = data.model_dump(by_alias=True)
    record["fetchedAt"] = datetime.now(tz=PACIFIC)
    get_db().collection("snotelData").document(mountain["id"]).set(record)

    # Bank ONE idempotent history doc per reading date across the window, so a
    # previously-missed day fills in on any later successful run (self-healing).
    station_meta = {
        "stationId": record["stationId"], "stationTriplet": record["stationTriplet"],
        "stationName": record["stationName"], "elevationFt": record["elevationFt"],
        "lat": record["lat"], "lng": record["lng"],
    }
    readings = {r["date"]: r for r in record["trend"]}
    readings[record["current"]["date"]] = record["current"]
    for day, reading in readings.items():
        fc.append_history("snotelData", mountain["id"], day, {**station_meta, "reading": reading})

    obs.log_event("INFO", "pipeline_success", source="snotel", mountainId=mountain["id"])
    print(f"snotel_worker: wrote snotelData/{mountain['id']} (station {station_id})")
