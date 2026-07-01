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
