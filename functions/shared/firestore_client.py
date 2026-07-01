import os
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import firestore

_db_client = None

SNAPSHOT_TTL_DAYS = 35


def _db():
    """Singleton Firestore client (init firebase_admin once per warm instance).
    Honors FIRESTORE_DATABASE (e.g. "dev-db"); unset or "(default)" → the
    project's default database.

    firebase-admin 6.5.0's firestore.client() takes no database id, so for a
    NAMED database we build a google-cloud-firestore Client directly, reusing the
    app's credentials + project so it matches firebase_admin's auth."""
    global _db_client
    if _db_client is None:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db_id = os.environ.get("FIRESTORE_DATABASE")
        if db_id and db_id != "(default)":
            from google.cloud import firestore as gcf

            app = firebase_admin.get_app()
            _db_client = gcf.Client(
                credentials=app.credential.get_credential(),
                project=app.project_id,
                database=db_id,
            )
        else:
            _db_client = firestore.client()
    return _db_client


def _with_id(snap) -> dict:
    data = snap.to_dict() or {}
    data["id"] = snap.id
    return data


def get_mountain(slug: str) -> dict | None:
    """Read mountains/{slug}; returns the doc dict (with `id`) or None."""
    snap = _db().collection("mountains").document(slug).get()
    if not snap.exists:
        return None
    return _with_id(snap)


def upsert_mountain_conditions(
    mountain_id: str, forecast_blob_path: str, current_summary: dict
) -> None:
    """Write mountainConditions/{mountainId} (browse, current-only). Always called
    by the weather worker (contract §3 / spec §4)."""
    _db().collection("mountainConditions").document(mountain_id).set(
        {
            "mountainId": mountain_id,
            "forecastBlobPath": forecast_blob_path,
            "currentSummary": current_summary,
            "updatedAt": datetime.now(timezone.utc),
        },
        merge=True,
    )


def write_mountain_snapshot(mountain_id: str, blob_path: str, models: dict) -> str:
    """Append a forecast snapshot under a mountain with a 35-day TTL (expireAt).
    Returns the new snapshot id. Powers forecast-evolution (accumulates forward)."""
    now = datetime.now(timezone.utc)
    payload = {
        "fetchedAt": now,
        "forecastBlobPath": blob_path,
        "models": models,
        "expireAt": now + timedelta(days=SNAPSHOT_TTL_DAYS),
    }
    _, ref = (
        _db().collection("mountains").document(mountain_id)
        .collection("snapshots").add(payload)
    )
    return ref.id


def append_history(parent_collection: str, parent_id: str, key: str, record: dict) -> None:
    """Append a dated time-series record under <parent>/<id>/history/<key> with a
    35-day TTL (expireAt). Date-keyed so re-running the same day is idempotent.

    SOLE sanctioned writer to any `…/history/*` subcollection: the `history`
    collection-group TTL only deletes docs carrying `expireAt`, which this
    function always stamps — bypassing it would leak undeleted history docs."""
    now = datetime.now(timezone.utc)
    payload = {**record, "expireAt": now + timedelta(days=SNAPSHOT_TTL_DAYS)}
    (
        _db().collection(parent_collection).document(parent_id)
        .collection("history").document(key).set(payload)
    )


def all_mountain_ids() -> list[str]:
    """All seed mountain ids (for scheduled browse fan-out, spec §4)."""
    return [s.id for s in _db().collection("mountains").stream()]
