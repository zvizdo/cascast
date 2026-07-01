import json
from datetime import datetime

from google.cloud import storage

from shared import config

_storage_client: storage.Client | None = None


def _client() -> storage.Client:
    """Lazily create a singleton GCS client (re-used across warm invocations)."""
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client(project=config.GCP_PROJECT)
    return _storage_client


def blob_path(mountain_id: str, dt: datetime) -> str:
    """Combined-forecast object path per contract §4:
    forecasts/{mountainId}/{YYYY-MM-DD}/{HHmm}-combined.json
    """
    return (
        f"forecasts/{mountain_id}/"
        f"{dt.strftime('%Y-%m-%d')}/{dt.strftime('%H%M')}-combined.json"
    )


def write_combined_blob(mountain_id: str, dt: datetime, blob: str | dict) -> str:
    """Upload the combined.json blob to the PRIVATE weather-data bucket.

    Returns the object path (the value stored as forecastBlobPath).
    """
    payload = blob if isinstance(blob, str) else json.dumps(blob)
    path = blob_path(mountain_id, dt)
    bucket = config.GCS_BUCKET_WEATHER
    obj = _client().bucket(bucket).blob(path)
    obj.upload_from_string(payload, content_type="application/json")
    return path


def write_satellite_metadata(mountain_id: str, record: dict) -> str:
    """Mirror the satelliteCache record to the satellite-tiles bucket (contract §4):
    ${satellite-tiles}/{mountainId}/metadata.json

    Returns the object path.
    """
    path = f"{mountain_id}/metadata.json"
    obj = _client().bucket(config.GCS_BUCKET_SATELLITE).blob(path)
    obj.upload_from_string(json.dumps(record, default=str), content_type="application/json")
    return path


def write_satellite_image(mountain_id: str, jpeg: bytes) -> str:
    """Upload the rendered true-color scene JPEG to the satellite bucket:
    ${satellite-tiles}/{mountainId}/scene.jpg . Returns the object path.
    """
    path = f"{mountain_id}/scene.jpg"
    obj = _client().bucket(config.GCS_BUCKET_SATELLITE).blob(path)
    obj.upload_from_string(jpeg, content_type="image/jpeg")
    return path


def write_satellite_image_history(mountain_id: str, scene_date: str, jpeg: bytes) -> str:
    """Append the rendered scene JPEG to the dated history under a TOP-LEVEL prefix:
    ${satellite-tiles}/history/{mountainId}/{scene_date}.jpg . One GCS lifecycle rule
    on the history/ prefix retains these for 35 days; the latest {id}/scene.jpg stays
    OUTSIDE that prefix. Returns the object path.
    """
    path = f"history/{mountain_id}/{scene_date}.jpg"
    obj = _client().bucket(config.GCS_BUCKET_SATELLITE).blob(path)
    obj.upload_from_string(jpeg, content_type="image/jpeg")
    return path


def write_terrain_model(mountain_id: str, glb: bytes) -> str:
    """Upload the baked terrain mesh GLB to the terrain bucket:
    ${terrain}/{mountainId}/terrain.glb . Returns the object path.
    """
    path = f"{mountain_id}/terrain.glb"
    obj = _client().bucket(config.GCS_BUCKET_TERRAIN).blob(path)
    obj.upload_from_string(glb, content_type="model/gltf-binary")
    return path


def write_terrain_meta(mountain_id: str, meta_json: str) -> str:
    """Upload the terrain metadata JSON to the terrain bucket:
    ${terrain}/{mountainId}/metadata.json . Returns the object path.
    """
    path = f"{mountain_id}/metadata.json"
    obj = _client().bucket(config.GCS_BUCKET_TERRAIN).blob(path)
    obj.upload_from_string(meta_json, content_type="application/json")
    return path
