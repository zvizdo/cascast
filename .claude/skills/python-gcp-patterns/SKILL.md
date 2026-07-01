---
name: python-gcp-patterns
description: Python 3.12 Cloud Functions Gen2 best practices — Pub/Sub CloudEvent deserialization, firebase_admin singleton, Pydantic v2, async httpx, tenacity retry, error handling, and pytest patterns
user-invocable: false
---

## Cloud Functions Entry Point
- Always use `@functions_framework.cloud_event` decorator for Pub/Sub-triggered functions.
- Deserialize Pub/Sub message correctly:
  ```python
  import base64, json
  message_data = base64.b64decode(cloud_event.data["message"]["data"]).decode()
  payload = json.loads(message_data)
  ```
- Initialize `firebase_admin` ONCE at module level (outside the handler) to reuse across warm invocations:
  ```python
  import firebase_admin
  if not firebase_admin._apps:
      firebase_admin.initialize_app()
  ```

## Pydantic v2 (not v1 — breaking changes apply)
- Use `model_validate(data)` not `.parse_obj(data)`.
- Use `model_dump()` not `.dict()`.
- `Optional[X]` fields require `= None` default. Prefer `X | None = None` syntax.
- Validators use `@field_validator('field_name')` with `@classmethod`, not `@validator`.
- `model_config = ConfigDict(...)` replaces inner `class Config`.

## Async httpx Pattern
- Cloud Function entrypoints are synchronous. Wrap async code with `asyncio.run()`:
  ```python
  import asyncio
  async def _fetch_all_models(lat, lng): ...
  result = asyncio.run(_fetch_all_models(lat, lng))
  ```
- Always set a timeout: `httpx.AsyncClient(timeout=httpx.Timeout(30.0))`.
- Use `async with httpx.AsyncClient(...) as client:` — never reuse a client across asyncio.run() calls.
- Raise on non-200: `response.raise_for_status()` before parsing.

## Tenacity Retry
- Wrap all external API calls:
  ```python
  from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
  
  @retry(
      stop=stop_after_attempt(3),
      wait=wait_exponential(multiplier=1, min=2, max=10),
      retry=retry_if_exception_type(httpx.HTTPError),
  )
  async def fetch_with_retry(client, url, params): ...
  ```

## Firestore Client Patterns
- Get client once at module level or once per invocation — do not recreate per-call:
  ```python
  db = firestore.client()
  ```
- Check document existence before `.to_dict()`:
  ```python
  doc = db.collection("mountains").document(mountain_id).get()
  if not doc.exists:
      raise ValueError(f"Mountain {mountain_id} not found")
  mountain = doc.to_dict()
  ```
- Batch writes when updating multiple project documents:
  ```python
  batch = db.batch()
  for project_id in project_ids:
      ref = db.collection("projects").document(project_id)
      batch.update(ref, {"currentSummary": summary, "lastRefreshedAt": firestore.SERVER_TIMESTAMP})
  batch.commit()
  ```

## Error Handling Philosophy
- Partial success is valid and preferred: if one weather model fails, continue with the other two. Log with `logging.warning()`.
- Set `lastRefreshStatus = "error"` only when ALL models fail.
- Never silently swallow exceptions — log the full traceback so the DLQ can catch retries:
  ```python
  import logging, traceback
  logging.error("Weather fetch failed: %s\n%s", str(e), traceback.format_exc())
  raise  # re-raise so Pub/Sub retries
  ```
- Use structured logging: `logging.info("Fetched %d models for %s", len(results), mountain_id)`.

## Project Structure per Worker
Each function directory must have:
- `main.py` — entrypoint with `@functions_framework.cloud_event`
- `requirements.txt` — pinned dependencies (not ranges)
- `tests/test_main.py` — pytest tests

Shared code lives in `functions/shared/` and is symlinked or copied into each function's deploy zip via Terraform's `archive_file` source_dir.

## Testing Patterns (pytest)
- Use `pyproject.toml` at `functions/` root with `asyncio_mode = "auto"`.
- Mock firebase_admin at the module level:
  ```python
  @pytest.fixture(autouse=True)
  def mock_firebase(mocker):
      mocker.patch("firebase_admin.initialize_app")
      mocker.patch("firebase_admin.firestore.client", return_value=MagicMock())
  ```
- Use `pytest-httpx` to intercept httpx: `httpx_mock.add_response(url=..., json=...)`.
- Never make real network calls in tests — `pytest-httpx` will raise if an unmocked request is made.
- Test the partial-failure path: one model's httpx mock returns 500, assert the other two models still write.
