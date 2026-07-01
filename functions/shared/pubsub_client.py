import json
import os

from google.cloud import pubsub_v1

from shared import config

_publisher_client: pubsub_v1.PublisherClient | None = None


def _publisher() -> pubsub_v1.PublisherClient:
    global _publisher_client
    if _publisher_client is None:
        _publisher_client = pubsub_v1.PublisherClient()
    return _publisher_client


def publish(logical_topic: str, message_dict: dict) -> str:
    """Publish a JSON message to the topic named `logical_topic`.

    Topics are bare in this single-environment deployment (no env prefix),
    e.g. logical_topic="weather-refresh" -> weather-refresh.
    Returns the published message id. Raises on publish failure (caller retries).
    """
    project = os.environ.get("GCP_PROJECT", config.GCP_PROJECT)
    publisher = _publisher()
    topic = publisher.topic_path(project, logical_topic)
    data = json.dumps(message_dict).encode("utf-8")
    future = publisher.publish(topic, data)
    return future.result()
