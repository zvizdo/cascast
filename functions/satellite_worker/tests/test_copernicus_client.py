import asyncio

import pytest

from satellite_worker import copernicus_client as cc


@pytest.fixture(autouse=True)
def _creds(monkeypatch):
    monkeypatch.setenv("CDSE_CLIENT_ID", "test-id")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "test-secret")
    cc._reset_token_cache()  # ensure no cross-test token leakage
    yield
    cc._reset_token_cache()


def test_bbox_from_latlng():
    bbox = cc.bbox_for(46.8517, -121.7603)
    assert bbox["west"] == pytest.approx(-121.8403, abs=1e-3)
    assert bbox["east"] == pytest.approx(-121.6803, abs=1e-3)
    assert bbox["south"] == pytest.approx(46.7717, abs=1e-3)
    assert bbox["north"] == pytest.approx(46.9317, abs=1e-3)


def test_eox_tile_template_is_zyx():
    tpl = cc.eox_tile_template()
    assert "{z}/{y}/{x}" in tpl
    assert tpl.endswith(".jpg")


def test_parse_search_extracts_latest_scene(load_fixture):
    # Values mirror the real CDSE capture in fixtures/copernicus_search.json
    # (Task 9): newest feature first, cloud cover under the 70% threshold.
    scene = cc.parse_search(load_fixture("copernicus_search.json"))
    assert scene["sceneId"].startswith("S2B_MSIL2A_20260613")
    assert scene["latestImageDate"] == "2026-06-13"
    assert scene["cloudCoverPercent"] == 0.07


def test_parse_search_no_scene_returns_none():
    assert cc.parse_search({"type": "FeatureCollection", "features": []}) is None


@pytest.mark.asyncio
async def test_token_is_cached_until_expiry(httpx_mock):
    httpx_mock.add_response(
        url=cc.TOKEN_URL,
        json={"access_token": "jwt-abc", "expires_in": 600},
    )
    t1 = await cc.get_token()
    t2 = await cc.get_token()
    assert t1 == t2 == "jwt-abc"
    # only ONE token request despite two calls (cached until exp)
    assert len(httpx_mock.get_requests(url=cc.TOKEN_URL)) == 1


@pytest.mark.asyncio
async def test_token_refetched_after_expiry(httpx_mock, monkeypatch):
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt-1", "expires_in": 600})
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt-2", "expires_in": 600})
    now = [1000.0]
    monkeypatch.setattr(cc.time, "monotonic", lambda: now[0])
    t1 = await cc.get_token()
    now[0] += 10_000  # well past 600s (minus skew)
    t2 = await cc.get_token()
    assert t1 == "jwt-1" and t2 == "jwt-2"


def test_parse_search_skips_cloudy_picks_next():
    payload = {
        "type": "FeatureCollection",
        "features": [
            {"id": "cloudy", "properties": {"datetime": "2026-06-13T00:00:00Z", "eo:cloud_cover": 91.8}},
            {"id": "clear", "properties": {"datetime": "2026-06-10T00:00:00Z", "eo:cloud_cover": 12.4}},
        ],
    }
    scene = cc.parse_search(payload)
    assert scene["sceneId"] == "clear"
    assert scene["cloudCoverPercent"] == 12.4


def test_parse_search_all_cloudy_returns_none():
    payload = {
        "type": "FeatureCollection",
        "features": [
            {"id": "a", "properties": {"datetime": "2026-06-13T00:00:00Z", "eo:cloud_cover": 95.0}},
        ],
    }
    assert cc.parse_search(payload) is None


@pytest.mark.asyncio
async def test_get_token_does_not_retry_4xx(httpx_mock):
    # N2: a deterministic 401 must NOT be retried -> exactly 1 token request.
    import httpx
    httpx_mock.add_response(url=cc.TOKEN_URL, status_code=401)
    with pytest.raises(httpx.HTTPStatusError):
        await cc.get_token()
    assert len(httpx_mock.get_requests(url=cc.TOKEN_URL)) == 1


@pytest.mark.asyncio
async def test_search_scene_posts_stac_body(httpx_mock, load_fixture):
    # The CDSE SentinelHub catalog rejects server-side sortby/filter/query (HTTP 400);
    # the body must carry only bbox + datetime + collections + limit.
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt", "expires_in": 600})
    httpx_mock.add_response(url=cc.SEARCH_URL, json=load_fixture("copernicus_search.json"))
    scene = await cc.search_latest_scene(bbox=cc.bbox_for(46.85, -121.76))
    assert scene["latestImageDate"] == "2026-06-13"
    body = httpx_mock.get_requests(url=cc.SEARCH_URL)[0].read().decode()
    assert "sentinel-2-l2a" in body
    assert '"sortby"' not in body
    assert '"filter"' not in body


def test_render_scene_image_posts_process_request(monkeypatch):
    captured = {}

    class _Resp:
        content = b"\xff\xd8\xff\xe0JPEGBYTES"
        headers = {"content-type": "image/jpeg"}
        def raise_for_status(self): pass

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["json"] = json
            captured["auth"] = headers.get("Authorization")
            captured["accept"] = headers.get("Accept")
            return _Resp()

    monkeypatch.setattr(cc.httpx, "AsyncClient", _Client)
    async def _tok(): return "TKN"
    monkeypatch.setattr(cc, "get_token", _tok)

    bbox = {"west": -121.84, "south": 46.77, "east": -121.68, "north": 46.93}
    out = asyncio.run(cc.render_scene_image(bbox, "2026-06-13"))

    assert out == b"\xff\xd8\xff\xe0JPEGBYTES"
    assert captured["url"] == cc.PROCESS_URL
    assert captured["auth"] == "Bearer TKN"
    assert captured["accept"] == "image/jpeg"
    body = captured["json"]
    assert body["input"]["bounds"]["bbox"] == [-121.84, 46.77, -121.68, 46.93]
    df = body["input"]["data"][0]["dataFilter"]["timeRange"]
    assert df["from"] == "2026-06-13T00:00:00Z"
    assert df["to"] == "2026-06-13T23:59:59Z"
    assert body["output"]["responses"][0]["format"]["type"] == "image/jpeg"
    # Lock the true-color band math against accidental edits.
    assert "2.5*s.B04" in body["evalscript"]
    assert "output:{bands:3}" in body["evalscript"]


def test_parse_scenes_returns_all_under_threshold(load_fixture):
    scenes = cc.parse_scenes(load_fixture("copernicus_search.json"))
    assert isinstance(scenes, list) and len(scenes) >= 1
    assert all(s["cloudCoverPercent"] is None or s["cloudCoverPercent"] < cc.CLOUD_THRESHOLD for s in scenes)
    assert scenes[0]["latestImageDate"] == "2026-06-13"


def test_parse_search_still_returns_newest(load_fixture):
    payload = load_fixture("copernicus_search.json")
    assert cc.parse_search(payload) == cc.parse_scenes(payload)[0]


def test_window_search_body_uses_trailing_window():
    body = cc._search_body({"west": -1, "south": -1, "east": 1, "north": 1}, start="2026-05-13", limit=40)
    assert body["datetime"].startswith("2026-05-13T00:00:00Z/")
    assert body["limit"] == 40


def test_default_search_body_is_open_ended():
    body = cc._search_body({"west": -1, "south": -1, "east": 1, "north": 1})
    assert body["datetime"].startswith("2015-06-23T00:00:00Z/")
    assert body["limit"] == cc.SEARCH_LIMIT


@pytest.mark.asyncio
async def test_search_recent_scenes_returns_window(httpx_mock, load_fixture):
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt", "expires_in": 600})
    httpx_mock.add_response(url=cc.SEARCH_URL, json=load_fixture("copernicus_search.json"))
    scenes = await cc.search_recent_scenes(bbox=cc.bbox_for(46.85, -121.76))
    assert isinstance(scenes, list) and len(scenes) >= 1
    assert scenes[0]["latestImageDate"] == "2026-06-13"
    body = httpx_mock.get_requests(url=cc.SEARCH_URL)[0].read().decode()
    assert '"limit": 40' in body or '"limit":40' in body


def test_render_scene_image_rejects_non_image_content_type(monkeypatch):
    # A 200 carrying a JSON error envelope must NOT be returned as image bytes.
    class _Resp:
        content = b'{"error":"boom"}'
        headers = {"content-type": "application/json"}
        def raise_for_status(self): pass

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            return _Resp()

    monkeypatch.setattr(cc.httpx, "AsyncClient", _Client)
    async def _tok(): return "TKN"
    monkeypatch.setattr(cc, "get_token", _tok)

    bbox = {"west": -121.84, "south": 46.77, "east": -121.68, "north": 46.93}
    with pytest.raises(ValueError, match="non-image content-type"):
        asyncio.run(cc.render_scene_image(bbox, "2026-06-13"))
