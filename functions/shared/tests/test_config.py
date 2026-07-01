import importlib
import pytest
from shared import config

def test_project_defaults(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "mountain-weatherman-app")
    importlib.reload(config)
    assert config.GCP_PROJECT == "mountain-weatherman-app"

def test_topic_path_builds_full_path(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "mountain-weatherman-app")
    importlib.reload(config)
    assert config.topic_path("weather-refresh") == \
        "projects/mountain-weatherman-app/topics/weather-refresh"

def test_require_env_raises(monkeypatch):
    monkeypatch.delenv("CDSE_CLIENT_ID", raising=False)
    importlib.reload(config)
    with pytest.raises(RuntimeError, match="Missing required env var: CDSE_CLIENT_ID"):
        config.require_env("CDSE_CLIENT_ID")
