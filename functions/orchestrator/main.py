"""orchestrator entry point: orchestrate (Pub/Sub CloudEvent from Cloud Scheduler).

The app is mountain-centric (projects removed). The orchestrate handler receives
{"type": "weather"|"nwac"|"snotel"|"satellite"} and fans the source out to every
mountain: it publishes one {"mountainId": <id>} message to that source's refresh
topic for each mountain. No active-project querying, no browse/pinned distinction,
no throttle.
"""

import base64
import json

import functions_framework

from shared import firestore_client as fc
from shared import pubsub_client as pc

TYPE_TO_TOPIC = {
    "weather": "weather-refresh",
    "nwac": "nwac-refresh",
    "snotel": "snotel-refresh",
    "satellite": "satellite-refresh",
}


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode("utf-8"))


@functions_framework.cloud_event
def orchestrate(cloud_event):
    msg = _decode(cloud_event)
    topic = TYPE_TO_TOPIC.get(msg.get("type"))
    if topic is None:
        return
    for mid in fc.all_mountain_ids():
        pc.publish(topic, {"mountainId": mid})
