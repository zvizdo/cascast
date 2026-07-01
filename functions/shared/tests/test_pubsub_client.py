import json
from unittest.mock import MagicMock

import shared.pubsub_client as pc


def test_publish_encodes_json_to_bytes_and_returns_message_id(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "mountain-weatherman-app")
    fake_future = MagicMock()
    fake_future.result.return_value = "msg-123"
    fake_publisher = MagicMock()
    fake_publisher.publish.return_value = fake_future
    fake_publisher.topic_path.return_value = (
        "projects/mountain-weatherman-app/topics/weather-refresh")
    monkeypatch.setattr(pc, "_publisher", lambda: fake_publisher)

    msg_id = pc.publish("weather-refresh", {"mountainId": "mt-rainier", "reason": "manual"})

    assert msg_id == "msg-123"
    fake_publisher.topic_path.assert_called_once_with(
        "mountain-weatherman-app", "weather-refresh")
    topic_arg, data_arg = fake_publisher.publish.call_args.args
    assert topic_arg == "projects/mountain-weatherman-app/topics/weather-refresh"
    assert json.loads(data_arg.decode("utf-8")) == {
        "mountainId": "mt-rainier", "reason": "manual"}


def test_publish_uses_bare_logical_topic(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "p")
    fake_future = MagicMock(); fake_future.result.return_value = "x"
    fake_publisher = MagicMock(); fake_publisher.publish.return_value = fake_future
    fake_publisher.topic_path.side_effect = lambda proj, topic: f"projects/{proj}/topics/{topic}"
    monkeypatch.setattr(pc, "_publisher", lambda: fake_publisher)

    pc.publish("snotel-refresh", {"mountainId": "mt-rainier"})
    fake_publisher.topic_path.assert_called_once_with("p", "snotel-refresh")
