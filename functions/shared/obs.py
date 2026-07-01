"""Structured logging for Cloud Run / Cloud Functions Gen2.

Cloud Run parses a single-line JSON object on stdout: the top-level `severity`
field becomes the LogEntry severity and the remaining fields become jsonPayload.
This yields correct severity AND filterable fields with no logging-library setup.

`event` is the contract the Cloud Monitoring alert filters key on:
  - "pipeline_success" (INFO)  -> log-based success metrics / absence alerts
  - "pipeline_error"   (ERROR) -> the pipeline-error log-matched alert
"""
from __future__ import annotations

import json


def log_event(severity: str, event: str, **fields) -> None:
    print(json.dumps({"severity": severity, "event": event, **fields}))
