import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

@pytest.fixture
def load_fixture():
    def _load(name: str) -> dict:
        return json.loads((FIXTURES / name).read_text())
    return _load

@pytest.fixture
def mock_db():
    with patch("firebase_admin.firestore.client") as m:
        yield m.return_value

@pytest.fixture
def mock_publisher():
    with patch("google.cloud.pubsub_v1.PublisherClient") as m:
        yield m.return_value

@pytest.fixture
def mock_storage_client():
    with patch("google.cloud.storage.Client") as m:
        yield m.return_value

@pytest.fixture
def sample_mountain_doc():
    return {
        "slug": "mt-rainier", "name": "Mount Rainier",
        "lat": 46.8517, "lng": -121.7603,
        "elevations": {"base": 5420, "mid": 10188, "summit": 14410},
        "nwacZone": "west-slopes-south", "nwacZoneId": "1648",
        "snotelStationId": "679", "snotelStationTriplet": "679:WA:SNTL",
        "snotelStationName": "Paradise", "region": "cascades-south",
        "timezone": "America/Los_Angeles",
    }

@pytest.fixture
def sample_active_project(sample_mountain_doc):
    return {
        "id": "proj-abc", "mountainId": "mt-rainier", "status": "active",
        "targetDateStart": "2026-08-02", "targetDateEnd": "2026-08-03",
        "mountainName": "Mount Rainier", "mountainSlug": "mt-rainier",
    }
