"""weather_worker entry point: handle_message (Pub/Sub CloudEvent).

Pipeline (spec §4): fetch mountain -> fetch Open-Meteo -> build CombinedForecastBlob
-> write blob to GCS -> ALWAYS upsert mountainConditions (browse headline rollup)
-> append ONE per-mountain forecast snapshot (mountains/{id}/snapshots, 35d TTL).

Status rules:
- all 3 models unavailable / fetch raised  -> "error", no blob, re-raise (Pub/Sub retry -> DLQ)
- some (but not all) models unavailable     -> "partial" (blob + conditions still written)
- all models available                       -> "ok"
"""

import asyncio
import base64
import json
import logging
from datetime import datetime, timezone

import functions_framework

from shared import firestore_client as fc
from shared import obs
from shared import storage_client as sc
from shared.models import CombinedForecastBlob
from weather_worker import open_meteo_client as omc
from weather_worker import summary as summ
from weather_worker import tone as tn

MODEL_KEYS = ("hrrr", "gfs", "ecmwf")


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _refresh_status(series_by_key: dict) -> str:
    available = [series_by_key[k].available for k in MODEL_KEYS]
    if not any(available):
        return "error"
    if all(available):
        return "ok"
    return "partial"


@functions_framework.cloud_event
def handle_message(cloud_event):
    msg = _decode(cloud_event)
    mountain_id = msg["mountainId"]
    try:
        _handle(mountain_id)
    except omc.OpenMeteoError:
        raise  # already logged with its errorClass inside _handle
    except Exception as exc:
        # Any unexpected exception is a real bug -> actionable + reaches DLQ.
        obs.log_event(
            "ERROR", "pipeline_error", source="weather", mountainId=mountain_id,
            error=str(exc) or repr(exc), errorClass="actionable",
        )
        raise


def _handle(mountain_id: str) -> None:
    mountain = fc.get_mountain(mountain_id)
    if mountain is None:
        raise ValueError(f"Unknown mountain: {mountain_id}")

    # Fetch. A total failure (no GFS/ECMWF) raises OpenMeteoError.
    try:
        series_by_key = asyncio.run(omc.fetch_forecast(mountain))
    except omc.OpenMeteoError as exc:
        # Transient (self-heals) vs actionable (bad params) drives the alert.
        error_class = "transient" if isinstance(
            exc, (omc.OpenMeteoUnavailable, omc.OpenMeteoThrottled)) else "actionable"
        logging.error("weather fetch failed for mountain %s", mountain_id, exc_info=True)
        obs.log_event(
            "ERROR", "pipeline_error", source="weather", mountainId=mountain_id,
            error=str(exc) or repr(exc), errorClass=error_class,
        )
        raise  # let Pub/Sub retry -> DLQ

    status = _refresh_status(series_by_key)
    if status == "error":
        # GFS+ECMWF both missing -> upstream data gap that self-heals. Transient.
        logging.error("no usable models for mountain %s", mountain_id)
        obs.log_event(
            "ERROR", "pipeline_error", source="weather", mountainId=mountain_id,
            error="no usable models", errorClass="transient",
        )
        raise omc.OpenMeteoError(f"No usable models for {mountain_id}")

    fetched_at = datetime.now(timezone.utc)
    blob = CombinedForecastBlob(
        mountainId=mountain_id,
        timezone=mountain["timezone"],
        fetchedAt=fetched_at,
        hrrr=series_by_key["hrrr"],
        gfs=series_by_key["gfs"],
        ecmwf=series_by_key["ecmwf"],
    )
    blob_path = sc.write_combined_blob(
        mountain_id, fetched_at, blob.model_dump(by_alias=True, mode="json")
    )

    summit_ft = mountain["elevations"]["summit"]

    # mountainConditions is browse-only: always summarize TODAY's conditions.
    browse_target = fetched_at.date().isoformat()
    cond_summary = _summary_for(blob, browse_target, summit_ft, nwac_danger=None)
    fc.upsert_mountain_conditions(mountain_id, blob_path, cond_summary.model_dump())

    # One per-mountain forecast snapshot (powers forecast-evolution). Store per-model,
    # PER-DAY summaries for all forecast days so the frontend can reconstruct the
    # predicted conditions for ANY user-chosen target date in range.
    models = summ.all_model_summaries_by_day(blob)
    fc.write_mountain_snapshot(mountain_id, blob_path=blob_path, models=models)

    obs.log_event("INFO", "pipeline_success", source="weather", mountainId=mountain_id)


def _summary_for(blob, target_date, summit_ft, nwac_danger):
    _, day = summ.choose_summary_model(blob, target_date)
    label, _ = tn.score_tone(
        max_wind=day.summitMaxSustainedWindMph or 0.0,
        max_gust=day.summitMaxWindMph or 0.0,
        precip=day.summitPrecipIn or 0.0,
        nwac_danger=nwac_danger,
        high_f=day.summitHighF if day.summitHighF is not None else 50.0,
    )
    v = tn.verdict(
        label,
        max_wind=day.summitMaxSustainedWindMph or 0.0,
        max_gust=day.summitMaxWindMph or 0.0,
        precip=day.summitPrecipIn or 0.0,
        nwac_danger=nwac_danger,
        high_f=day.summitHighF if day.summitHighF is not None else 50.0,
        freezing_level_ft=day.freezingLevelFtNoon or 0.0,
        summit_ft=summit_ft,
    )
    return summ.build_current_summary(blob, target_date, summit_ft, tone=label, verdict=v)
