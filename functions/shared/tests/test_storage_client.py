from datetime import datetime, timezone
from unittest.mock import MagicMock

import shared.storage_client as sc


def test_blob_path_builder_uses_contract_layout():
    dt = datetime(2026, 8, 2, 9, 5, tzinfo=timezone.utc)
    # contract §4: forecasts/{mountainId}/{YYYY-MM-DD}/{HHmm}-combined.json
    assert sc.blob_path("mt-rainier", dt) == \
        "forecasts/mt-rainier/2026-08-02/0905-combined.json"


def test_write_combined_blob_uploads_json_to_weather_bucket(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET_WEATHER", "mountain-weatherman-app-weather-data")
    fake_blob = MagicMock()
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket
    monkeypatch.setattr(sc, "_client", lambda: fake_client)

    dt = datetime(2026, 8, 2, 9, 5, tzinfo=timezone.utc)
    path = sc.write_combined_blob("mt-rainier", dt, '{"mountainId":"mt-rainier"}')

    assert path == "forecasts/mt-rainier/2026-08-02/0905-combined.json"
    fake_client.bucket.assert_called_once_with("mountain-weatherman-app-weather-data")
    fake_bucket.blob.assert_called_once_with(path)
    fake_blob.upload_from_string.assert_called_once_with(
        '{"mountainId":"mt-rainier"}', content_type="application/json")


def test_write_combined_blob_accepts_dict_and_serializes(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET_WEATHER", "bkt")
    fake_blob = MagicMock()
    fake_bucket = MagicMock(); fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock(); fake_client.bucket.return_value = fake_bucket
    monkeypatch.setattr(sc, "_client", lambda: fake_client)

    dt = datetime(2026, 8, 2, 0, 0, tzinfo=timezone.utc)
    sc.write_combined_blob("mt-baker", dt, {"mountainId": "mt-baker"})
    arg = fake_blob.upload_from_string.call_args.args[0]
    assert '"mountainId": "mt-baker"' in arg


def test_write_satellite_metadata_mirrors_to_satellite_bucket(monkeypatch):
    # B3 / contract §4: ${satellite-tiles}/{mountainId}/metadata.json mirror of satelliteCache.
    monkeypatch.setattr(sc.config, "GCS_BUCKET_SATELLITE", "mountain-weatherman-app-satellite-tiles")
    fake_blob = MagicMock()
    fake_bucket = MagicMock(); fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock(); fake_client.bucket.return_value = fake_bucket
    monkeypatch.setattr(sc, "_client", lambda: fake_client)

    record = {"mountainId": "mt-rainier", "latestImageDate": None,
              "updatedAt": datetime(2026, 6, 14, tzinfo=timezone.utc)}
    path = sc.write_satellite_metadata("mt-rainier", record)

    assert path == "mt-rainier/metadata.json"
    fake_client.bucket.assert_called_once_with("mountain-weatherman-app-satellite-tiles")
    fake_bucket.blob.assert_called_once_with("mt-rainier/metadata.json")
    payload, kwargs = fake_blob.upload_from_string.call_args
    arg = payload[0]
    assert '"mountainId": "mt-rainier"' in arg
    assert '"latestImageDate": null' in arg
    assert "2026-06-14" in arg  # datetime serialized via default=str
    assert kwargs["content_type"] == "application/json"


def test_write_satellite_image(monkeypatch):
    uploaded = {}

    class _Blob:
        def upload_from_string(self, data, content_type=None):
            uploaded["data"] = data
            uploaded["content_type"] = content_type

    class _Bucket:
        def blob(self, path):
            uploaded["path"] = path
            return _Blob()

    class _Client:
        def bucket(self, name):
            uploaded["bucket"] = name
            return _Bucket()

    monkeypatch.setattr(sc, "_client", lambda: _Client())
    monkeypatch.setattr(sc.config, "GCS_BUCKET_SATELLITE", "my-sat-bucket", raising=False)

    path = sc.write_satellite_image("mt-rainier", b"JPEGBYTES")
    assert path == "mt-rainier/scene.jpg"
    assert uploaded["bucket"] == "my-sat-bucket"
    assert uploaded["data"] == b"JPEGBYTES"
    assert uploaded["content_type"] == "image/jpeg"


def test_write_satellite_image_history(monkeypatch):
    # Dated history under a TOP-LEVEL history/ prefix so one lifecycle rule covers
    # every mountain; the latest {id}/scene.jpg stays OUTSIDE that prefix.
    uploaded = {}

    class _Blob:
        def upload_from_string(self, data, content_type=None):
            uploaded["data"] = data
            uploaded["content_type"] = content_type

    class _Bucket:
        def blob(self, path):
            uploaded["path"] = path
            return _Blob()

    class _Client:
        def bucket(self, name):
            uploaded["bucket"] = name
            return _Bucket()

    monkeypatch.setattr(sc, "_client", lambda: _Client())
    monkeypatch.setattr(sc.config, "GCS_BUCKET_SATELLITE", "my-sat-bucket", raising=False)

    path = sc.write_satellite_image_history("mt-rainier", "2026-06-13", b"JPEGBYTES")
    assert path == "history/mt-rainier/2026-06-13.jpg"
    assert uploaded["bucket"] == "my-sat-bucket"
    assert uploaded["path"] == "history/mt-rainier/2026-06-13.jpg"
    assert uploaded["data"] == b"JPEGBYTES"
    assert uploaded["content_type"] == "image/jpeg"
