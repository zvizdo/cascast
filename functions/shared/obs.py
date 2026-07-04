"""Structured logging for Cloud Run / Cloud Functions Gen2.

Cloud Run parses a single-line JSON object on stdout: the top-level `severity`
field becomes the LogEntry severity and the remaining fields become jsonPayload.
This yields correct severity AND filterable fields with no logging-library setup.

`event` is the contract the Cloud Monitoring alert filters key on:
  - "pipeline_success" (INFO)  -> log-based success metrics / absence alerts
  - "pipeline_error"   (ERROR) -> the pipeline-error log-matched alert
  - "errorClass"       ("transient"|"actionable") on pipeline_error -> alert filter
"""
from __future__ import annotations

import json
import asyncio


def log_event(severity: str, event: str, **fields) -> None:
    print(json.dumps({"severity": severity, "event": event, **fields}))


# Exception-type name substrings that mark a TRANSIENT upstream failure (a
# connection/read timeout or transport error from httpx/requests) without this
# module needing to import those libraries.
_TRANSIENT_NAME_MARKERS = (
    "timeout", "connect", "transport", "readerror", "writeerror",
    "networkerror", "poolerror", "remoteprotocol",
)


def classify_exception(exc: BaseException) -> str:
    """Best-effort error class for the alert: "transient" (self-heals on the next
    scheduled run — timeouts, connection/transport errors) or "actionable" (a real
    problem worth paging). The weather worker classifies precisely via its own
    OpenMeteo exception taxonomy; the other workers use this heuristic default,
    which errs toward "actionable" for anything unrecognized."""
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError)):
        return "transient"
    name = type(exc).__name__.lower()
    if any(marker in name for marker in _TRANSIENT_NAME_MARKERS):
        return "transient"
    return "actionable"
