import pytest

from weather_worker import open_meteo_client as omc


@pytest.fixture(autouse=True)
def _fast_open_meteo_io(monkeypatch):
    """Keep the Open-Meteo throttle controls from slowing the unit suite: no startup
    jitter and zero retry backoff. The retry COUNT still applies, so retry behavior
    is exercised without real sleeps."""
    monkeypatch.setattr(omc, "JITTER_SECONDS", 0.0)
    monkeypatch.setattr(omc, "RETRY_WAIT_MAX_SECONDS", 0.0)
