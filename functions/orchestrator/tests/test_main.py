import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from orchestrator import main


def _event(payload: dict):
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": data}})


@pytest.fixture
def patched(monkeypatch):
    s = SimpleNamespace()
    s.publish = MagicMock(return_value="msg")
    s.mountains = MagicMock(return_value=["mt-rainier", "mt-baker"])
    monkeypatch.setattr(main.pc, "publish", s.publish)
    monkeypatch.setattr(main.fc, "all_mountain_ids", s.mountains)
    return s


def test_no_active_project_helper_referenced():
    # The redesign removed projects entirely; the orchestrator must not reach for
    # any active-project query helper.
    assert not hasattr(main.fc, "get_active_projects")
    assert "get_active_projects" not in dir(main)


def test_weather_fanout_publishes_one_per_mountain(patched):
    main.orchestrate(_event({"type": "weather"}))
    published = [(c.args[0], c.args[1]) for c in patched.publish.call_args_list]
    assert published == [
        ("weather-refresh", {"mountainId": "mt-rainier"}),
        ("weather-refresh", {"mountainId": "mt-baker"}),
    ]


def test_nwac_fanout_publishes_one_per_mountain(patched):
    main.orchestrate(_event({"type": "nwac"}))
    published = [(c.args[0], c.args[1]) for c in patched.publish.call_args_list]
    assert published == [
        ("nwac-refresh", {"mountainId": "mt-rainier"}),
        ("nwac-refresh", {"mountainId": "mt-baker"}),
    ]


def test_snotel_fanout_publishes_one_per_mountain(patched):
    main.orchestrate(_event({"type": "snotel"}))
    published = [(c.args[0], c.args[1]) for c in patched.publish.call_args_list]
    assert published == [
        ("snotel-refresh", {"mountainId": "mt-rainier"}),
        ("snotel-refresh", {"mountainId": "mt-baker"}),
    ]


def test_satellite_fanout_publishes_one_per_mountain(patched):
    main.orchestrate(_event({"type": "satellite"}))
    published = [(c.args[0], c.args[1]) for c in patched.publish.call_args_list]
    assert published == [
        ("satellite-refresh", {"mountainId": "mt-rainier"}),
        ("satellite-refresh", {"mountainId": "mt-baker"}),
    ]


def test_unknown_type_no_publish(patched):
    main.orchestrate(_event({"type": "bogus"}))
    assert patched.publish.call_count == 0


def test_no_mountains_no_publish(patched):
    patched.mountains.return_value = []
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 0
