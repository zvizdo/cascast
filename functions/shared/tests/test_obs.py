import json

from shared import obs


def test_log_event_emits_single_json_line_with_severity_and_fields(capsys):
    obs.log_event("ERROR", "pipeline_error", source="weather", mountainId="mt-rainier", error="boom")
    out = capsys.readouterr().out.strip()
    assert "\n" not in out  # single line so Cloud Run parses it as one structured entry
    parsed = json.loads(out)
    assert parsed["severity"] == "ERROR"
    assert parsed["event"] == "pipeline_error"
    assert parsed["source"] == "weather"
    assert parsed["mountainId"] == "mt-rainier"
    assert parsed["error"] == "boom"


def test_log_event_success_minimal(capsys):
    obs.log_event("INFO", "pipeline_success", source="snotel", mountainId="mt-baker")
    parsed = json.loads(capsys.readouterr().out.strip())
    assert parsed == {
        "severity": "INFO",
        "event": "pipeline_success",
        "source": "snotel",
        "mountainId": "mt-baker",
    }


import asyncio


def test_classify_exception_timeout_is_transient():
    assert obs.classify_exception(asyncio.TimeoutError()) == "transient"
    assert obs.classify_exception(TimeoutError()) == "transient"


def test_classify_exception_connection_is_transient():
    assert obs.classify_exception(ConnectionError("reset")) == "transient"

    class ReadTimeout(Exception):
        pass

    class ConnectError(Exception):
        pass

    assert obs.classify_exception(ReadTimeout()) == "transient"   # name marker "timeout"
    assert obs.classify_exception(ConnectError()) == "transient"   # name marker "connect"


def test_classify_exception_other_is_actionable():
    assert obs.classify_exception(ValueError("bad field")) == "actionable"
    assert obs.classify_exception(KeyError("missing")) == "actionable"
