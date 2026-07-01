import os

GCP_PROJECT = os.environ.get("GCP_PROJECT", "mountain-weatherman-app")
GCS_BUCKET_WEATHER = os.environ.get("GCS_BUCKET_WEATHER", f"{GCP_PROJECT}-weather-data")
GCS_BUCKET_SATELLITE = os.environ.get("GCS_BUCKET_SATELLITE", f"{GCP_PROJECT}-satellite-tiles")
GCS_BUCKET_TERRAIN = os.environ.get("GCS_BUCKET_TERRAIN", f"{GCP_PROJECT}-terrain")

def topic_path(logical_name: str) -> str:
    """Full Pub/Sub topic path, e.g. 'weather-refresh' -> projects/<p>/topics/weather-refresh."""
    return f"projects/{GCP_PROJECT}/topics/{logical_name}"

def require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val
