# P11 — Real per-date satellite imagery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the actual most-recent cloud-free Sentinel-2 true-color scene for each peak (via the CDSE Sentinel Hub Processing API in the satellite worker), store it as a JPEG in GCS, and display it in the SatellitePanel instead of the hardcoded "RGB tile" placeholder.

**Architecture:** All CDSE interaction stays in the Python `satellite_worker` (the web app has no CDSE creds). On its weekly run, after the worker finds the latest cloud-free scene, it renders a true-color JPEG of the peak's bbox at that scene's date via the Processing API and writes it to `gs://<satellite-bucket>/<mountainId>/scene.jpg`. A thin Next.js route streams that object (no creds in Cloud Run); `SatellitePanel` renders it as an `<img>` with the existing placeholder as the no-scene/error fallback.

**Tech Stack:** Python 3.12 Cloud Function (httpx, tenacity, google-cloud-storage, pydantic v2), Next.js 16 route handler (@google-cloud/storage), React 19 component, Vitest + pytest (≥90% coverage), Playwright live e2e.

**Verified facts (live, 2026-06-15):**
- CDSE OAuth client-credentials (`cdse-client-id`/`cdse-client-secret` secrets) works.
- `POST https://sh.dataspace.copernicus.eu/api/v1/process` with that token returns a 512×512 `image/jpeg` of Rainier's bbox at 2026-06-13 (real current snowpack confirmed by eye). Black swath-edge wedges are real and acceptable.
- Satellite bucket: `mountain-weatherman-app-satellite-tiles`. Web env already sets `GCS_BUCKET_SATELLITE`.
- Coverage today: only `mt-rainier` has an active project, so only it is refreshed. We will manually publish `satellite-refresh` for all 10 mountains to populate them.

---

## File Structure

- `functions/satellite_worker/copernicus_client.py` (modify) — add `PROCESS_URL`, `TRUE_COLOR_EVALSCRIPT`, `render_scene_image(bbox, date) -> bytes`.
- `functions/shared/storage_client.py` (modify) — add `write_satellite_image(mountain_id, jpeg) -> str`.
- `functions/satellite_worker/main.py` (modify) — after a scene is found, render + store the image (graceful on failure).
- `functions/satellite_worker/tests/test_copernicus_client.py` (modify) — unit-test `render_scene_image` (mock httpx).
- `functions/satellite_worker/tests/test_main.py` (modify) — test image render is invoked on a fresh scene and that render failure degrades gracefully.
- `functions/shared/tests/test_storage_client.py` (modify) — test `write_satellite_image` path + upload.
- `lib/storage.ts` (modify) — add `readSatelliteImage(mountainId) -> { buffer, contentType } | null`.
- `app/api/projects/[id]/satellite/image/route.ts` (create) — stream the JPEG (404 if absent).
- `app/api/projects/[id]/satellite/image/__tests__/route.test.ts` (create).
- `components/project/SatellitePanel.tsx` (modify) — render `<img>` with placeholder fallback; new `imageUrl` prop.
- `components/project/ProjectDetail.tsx` (modify) — pass `imageUrl={`/api/projects/${id}/satellite/image`}` to SatellitePanel.
- `components/project/__tests__/SatellitePanel.test.tsx` (modify) — test img render + onError fallback + no-scene.
- `app/globals.css` (modify) — `.sat-tile img` styling (cover, rounded, full tile).
- `tests/e2e/p11-satellite-image.spec.ts` (create) — live: img present + loads (naturalWidth>0) on Rainier.

---

## Task 1: Worker renders + stores the true-color scene image

**Files:**
- Modify: `functions/satellite_worker/copernicus_client.py`
- Modify: `functions/shared/storage_client.py`
- Modify: `functions/satellite_worker/main.py`
- Test: `functions/satellite_worker/tests/test_copernicus_client.py`, `functions/shared/tests/test_storage_client.py`, `functions/satellite_worker/tests/test_main.py`

- [ ] **Step 1: Write failing test for `render_scene_image`** in `test_copernicus_client.py`

```python
def test_render_scene_image_posts_process_request(monkeypatch):
    captured = {}

    class _Resp:
        content = b"\xff\xd8\xff\xe0JPEGBYTES"
        def raise_for_status(self): pass

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["json"] = json
            captured["auth"] = headers.get("Authorization")
            return _Resp()

    monkeypatch.setattr(cc.httpx, "AsyncClient", _Client)
    async def _tok(): return "TKN"
    monkeypatch.setattr(cc, "get_token", _tok)

    bbox = {"west": -121.84, "south": 46.77, "east": -121.68, "north": 46.93}
    out = asyncio.run(cc.render_scene_image(bbox, "2026-06-13"))

    assert out == b"\xff\xd8\xff\xe0JPEGBYTES"
    assert captured["url"] == cc.PROCESS_URL
    assert captured["auth"] == "Bearer TKN"
    body = captured["json"]
    assert body["input"]["bounds"]["bbox"] == [-121.84, 46.77, -121.68, 46.93]
    df = body["input"]["data"][0]["dataFilter"]["timeRange"]
    assert df["from"] == "2026-06-13T00:00:00Z"
    assert df["to"] == "2026-06-13T23:59:59Z"
    assert body["output"]["responses"][0]["format"]["type"] == "image/jpeg"
```

- [ ] **Step 2: Run it; expect failure** (`AttributeError: render_scene_image`)

Run: `cd functions && source .venv/bin/activate && pytest satellite_worker/tests/test_copernicus_client.py -p no:cov -o addopts="" -q`

- [ ] **Step 3: Implement** in `copernicus_client.py` (add near the other constants + a new function)

```python
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
IMAGE_SIZE = 512
# True-color (B04/B03/B02) with a fixed 2.5 gain — matches the live-verified curl.
TRUE_COLOR_EVALSCRIPT = (
    "//VERSION=3\n"
    'function setup(){return{input:["B02","B03","B04"],output:{bands:3}};}\n'
    "function evaluatePixel(s){return [2.5*s.B04, 2.5*s.B03, 2.5*s.B02];}"
)


def _process_body(bbox: dict, date: str) -> dict:
    return {
        "input": {
            "bounds": {
                "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {"timeRange": {"from": f"{date}T00:00:00Z", "to": f"{date}T23:59:59Z"}},
            }],
        },
        "output": {
            "width": IMAGE_SIZE, "height": IMAGE_SIZE,
            "responses": [{"identifier": "default", "format": {"type": "image/jpeg"}}],
        },
        "evalscript": TRUE_COLOR_EVALSCRIPT,
    }


@_retry
async def render_scene_image(bbox: dict, date: str) -> bytes:
    """Render a true-color JPEG of the bbox for the given scene date (contract §5.4)."""
    token = await get_token()
    headers = {**HEADERS, "Authorization": f"Bearer {token}",
               "Content-Type": "application/json", "Accept": "image/jpeg"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(PROCESS_URL, headers=headers, json=_process_body(bbox, date))
        resp.raise_for_status()
        return resp.content
```

- [ ] **Step 4: Run test; expect PASS**

Run: `cd functions && source .venv/bin/activate && pytest satellite_worker/tests/test_copernicus_client.py -p no:cov -o addopts="" -q`

- [ ] **Step 5: Write failing test for `write_satellite_image`** in `functions/shared/tests/test_storage_client.py` (follow the existing `write_satellite_metadata` test's fake-bucket pattern in that file)

```python
def test_write_satellite_image(monkeypatch):
    uploaded = {}

    class _Blob:
        def upload_from_string(self, data, content_type=None):
            uploaded["data"] = data
            uploaded["content_type"] = content_type

    class _Bucket:
        def blob(self, path):
            uploaded["path"] = path
            return _Blob()

    class _Client:
        def bucket(self, name):
            uploaded["bucket"] = name
            return _Bucket()

    monkeypatch.setattr(sc, "_client", lambda: _Client())
    monkeypatch.setattr(sc.config, "GCS_BUCKET_SATELLITE", "my-sat-bucket", raising=False)

    path = sc.write_satellite_image("mt-rainier", b"JPEGBYTES")
    assert path == "mt-rainier/scene.jpg"
    assert uploaded["bucket"] == "my-sat-bucket"
    assert uploaded["data"] == b"JPEGBYTES"
    assert uploaded["content_type"] == "image/jpeg"
```

(If the existing tests reference the storage_client module under a different alias than `sc`, match that file's existing import alias.)

- [ ] **Step 6: Run it; expect failure**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_storage_client.py -p no:cov -o addopts="" -q`

- [ ] **Step 7: Implement `write_satellite_image`** in `shared/storage_client.py`

```python
def write_satellite_image(mountain_id: str, jpeg: bytes) -> str:
    """Upload the rendered true-color scene JPEG to the satellite bucket:
    ${satellite-tiles}/{mountainId}/scene.jpg . Returns the object path.
    """
    path = f"{mountain_id}/scene.jpg"
    obj = _client().bucket(config.GCS_BUCKET_SATELLITE).blob(path)
    obj.upload_from_string(jpeg, content_type="image/jpeg")
    return path
```

- [ ] **Step 8: Run test; expect PASS**

- [ ] **Step 9: Write failing test in `test_main.py`** — on a fresh scene the worker renders + stores the image; on render failure it still writes metadata (graceful). Follow the existing test fixtures in that file (it already fakes `get_db`, `cc.search_latest_scene`, `write_satellite_metadata`). Add:

```python
def test_handle_message_renders_and_stores_image(monkeypatch, ...):
    # arrange: mountain exists, search returns a scene newer than existing
    monkeypatch.setattr(main.cc, "render_scene_image", lambda bbox, date: b"IMGBYTES")
    calls = {}
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: calls.update(mid=mid, jpeg=jpeg) or f"{mid}/scene.jpg")
    # act: invoke handle_message
    # assert: calls["mid"] == "mt-rainier" and calls["jpeg"] == b"IMGBYTES"

def test_handle_message_image_render_failure_is_graceful(monkeypatch, ...):
    def _boom(bbox, date): raise RuntimeError("processing 500")
    monkeypatch.setattr(main.cc, "render_scene_image", _boom)
    # act + assert: handle_message does NOT raise; metadata write still happened.
```

Note: `render_scene_image` is async; main wraps it like `fetch_scene` does (`asyncio.run`). Test by monkeypatching the sync wrapper (see Step 11) — patch `main.render_scene_image` (the wrapper), not the async coroutine, to keep tests simple.

- [ ] **Step 10: Run it; expect failure**

- [ ] **Step 11: Implement in `main.py`** — add a sync wrapper and call it after the cache record is written, only when a scene exists:

```python
def render_scene_image(bbox: dict, date: str) -> bytes:
    """Sync wrapper around the async Processing-API render."""
    return asyncio.run(cc.render_scene_image(bbox, date))
```

Then in `handle_message`, after `cache_ref.set(record)` and `write_satellite_metadata(...)`, add:

```python
    if scene is not None:
        try:
            jpeg = render_scene_image(bbox, scene["latestImageDate"])
            write_satellite_image(mountain_id, jpeg)
            print(f"satellite_worker: stored scene image for {mountain_id}")
        except Exception as exc:  # Processing API outage / quota / transport
            print(f"satellite_worker: image render failed for {mountain_id} ({exc})")
```

Add the import: `from shared.storage_client import write_satellite_metadata, write_satellite_image`.

- [ ] **Step 12: Run full worker + shared suites; expect PASS with coverage**

Run: `cd functions && source .venv/bin/activate && pytest satellite_worker shared --cov-fail-under=90 -q`
(If a stale `.coverage` from the no-cov runs interferes, delete it first.)

- [ ] **Step 13: Commit**

```bash
git add functions/satellite_worker functions/shared
git commit -m "feat(satellite): render + store true-color scene JPEG via CDSE Processing API"
```

---

## Task 2: Web route streams the scene JPEG from GCS

**Files:**
- Modify: `lib/storage.ts`
- Create: `app/api/projects/[id]/satellite/image/route.ts`
- Test: `app/api/projects/[id]/satellite/image/__tests__/route.test.ts`

- [ ] **Step 1: Add `readSatelliteImage` to `lib/storage.ts`**

```typescript
export async function readSatelliteImage(
  mountainId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_SATELLITE")).file(`${mountainId}/scene.jpg`);
  const [present] = await f.exists();
  if (!present) return null;
  const [contents] = await f.download();
  return { buffer: contents, contentType: "image/jpeg" };
}
```

- [ ] **Step 2: Write failing test** `app/api/projects/[id]/satellite/image/__tests__/route.test.ts`

Mock `@/lib/firebase-admin` (`getDb` → project doc with `mountainId`) and `@/lib/storage` (`readSatelliteImage`). Follow the sibling `app/api/projects/[id]/satellite/__tests__/route.test.ts` for the getDb mock shape.

```typescript
it("404s when the project is missing", async () => { /* project.exists=false → 404 */ });
it("404s when no scene image exists", async () => { /* readSatelliteImage → null → 404 */ });
it("streams the JPEG with image/jpeg + cache headers", async () => {
  // readSatelliteImage → { buffer: Buffer.from([0xff,0xd8]), contentType: "image/jpeg" }
  const res = await GET(req, { params: Promise.resolve({ id: "p1" }) });
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  expect(res.headers.get("Cache-Control")).toContain("max-age");
  const body = Buffer.from(await res.arrayBuffer());
  expect(body[0]).toBe(0xff);
});
```

- [ ] **Step 3: Run it; expect failure** (route file not found)

Run: `npx vitest run app/api/projects/[id]/satellite/image`

- [ ] **Step 4: Implement** `app/api/projects/[id]/satellite/image/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { readSatelliteImage } from "@/lib/storage";

const CACHE = "public, max-age=3600, stale-while-revalidate=86400";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const project = await getDb().collection("projects").doc(id).get();
  if (!project.exists) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const { mountainId } = project.data() as { mountainId: string };

  const image = await readSatelliteImage(mountainId);
  if (!image) return NextResponse.json({ error: "No scene image" }, { status: 404 });

  return new NextResponse(image.buffer as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": image.contentType, "Cache-Control": CACHE },
  });
}
```

- [ ] **Step 5: Run test; expect PASS**

- [ ] **Step 6: Commit**

```bash
git add lib/storage.ts "app/api/projects/[id]/satellite/image"
git commit -m "feat(api): stream satellite scene JPEG from GCS"
```

---

## Task 3: SatellitePanel renders the image

**Files:**
- Modify: `components/project/SatellitePanel.tsx`
- Modify: `components/project/ProjectDetail.tsx`
- Modify: `app/globals.css`
- Test: `components/project/__tests__/SatellitePanel.test.tsx`

- [ ] **Step 1: Write failing tests** in `SatellitePanel.test.tsx`

```tsx
it("renders the scene image when a scene exists", () => {
  render(<SatellitePanel sat={SAT_WITH_SCENE} mountainName="Mt Rainier" imageUrl="/api/projects/p1/satellite/image" />);
  const img = screen.getByRole("img", { name: /sentinel-2 .*mt rainier/i });
  expect(img).toHaveAttribute("src", "/api/projects/p1/satellite/image");
});

it("falls back to the placeholder when the image fails to load", () => {
  render(<SatellitePanel sat={SAT_WITH_SCENE} mountainName="Mt Rainier" imageUrl="/api/projects/p1/satellite/image" />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
});

it("shows the placeholder when there is no scene", () => {
  render(<SatellitePanel sat={null} mountainName="Mt Rainier" imageUrl="/api/projects/p1/satellite/image" />);
  expect(screen.queryByRole("img", { name: /sentinel-2/i })).toBeNull();
  expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run; expect failure** (`imageUrl` prop unsupported / no img)

Run: `npx vitest run components/project/__tests__/SatellitePanel.test.tsx`

- [ ] **Step 3: Implement** — add `imageUrl: string` to `SatellitePanelProps`; add `const [imgError, setImgError] = React.useState(false)`; in the `.sat-tile` div, render the image when `hasScene && !imgError`, else the existing `.sat-placeholder`:

```tsx
<div className="sat-tile">
  {hasScene && !imgError ? (
    <img
      className="sat-img"
      src={imageUrl}
      alt={`Sentinel-2 true-color scene of ${mountainName}`}
      onError={() => setImgError(true)}
    />
  ) : (
    <div className="sat-placeholder">
      <Icons.satellite size={22} style={{ marginBottom: 6 }} />
      <br />RGB tile<br />{mountainName}
    </div>
  )}
</div>
```

- [ ] **Step 4: Run tests; expect PASS**

- [ ] **Step 5: Pass `imageUrl` from `ProjectDetail.tsx`** — change the render at line ~174 to:

```tsx
<SatellitePanel sat={sat} mountainName={project.mountainName} imageUrl={`/api/projects/${id}/satellite/image`} />
```

- [ ] **Step 6: Add CSS** in `app/globals.css` (near the existing `.sat-tile`/`.sat-placeholder` rules)

```css
.sat-img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block; }
```

(Match the `.sat-tile` dimensions/border-radius already in the file.)

- [ ] **Step 7: Run the web gate**

Run: `npm run build && npx vitest run --coverage`
Expected: build clean; coverage ≥ 90/90/85.

- [ ] **Step 8: Commit**

```bash
git add components/project/SatellitePanel.tsx components/project/ProjectDetail.tsx app/globals.css components/project/__tests__/SatellitePanel.test.tsx
git commit -m "feat(ui): render real Sentinel-2 scene image in SatellitePanel"
```

---

## Task 4: Deploy, populate all 10 mountains, live-verify

**Files:**
- Create: `tests/e2e/p11-satellite-image.spec.ts`

- [ ] **Step 1: Stage + deploy the worker**

```bash
./scripts/stage-functions.sh
terraform -chdir=terraform validate
terraform -chdir=terraform apply -auto-approve
```

(Only the `satellite_worker` source changed; apply re-zips it. If apply is slow/noisy, deploying just that function via `gcloud functions deploy` is acceptable — match the existing function name/runtime.)

- [ ] **Step 2: Publish `satellite-refresh` for all 10 mountains**

```bash
for m in colchuck-peak glacier-peak liberty-bell mt-adams mt-baker mt-hood mt-olympus mt-rainier mt-shuksan mt-st-helens; do
  gcloud pubsub topics publish dev-satellite-refresh --project mountain-weatherman-app --message "{\"mountainId\":\"$m\"}"
done
```

- [ ] **Step 3: Wait, then verify GCS has scene.jpg for the peaks** (cloud-free scenes may legitimately be missing for some — log which)

```bash
for m in colchuck-peak glacier-peak liberty-bell mt-adams mt-baker mt-hood mt-olympus mt-rainier mt-shuksan mt-st-helens; do
  echo -n "$m: "; gsutil ls gs://mountain-weatherman-app-satellite-tiles/$m/scene.jpg 2>&1 | tail -1
done
```

- [ ] **Step 4: Deploy the web app**

```bash
./scripts/deploy-web.sh dev
```

- [ ] **Step 5: Write the live e2e** `tests/e2e/p11-satellite-image.spec.ts` — data-tolerant: open the first project, scroll to the Snow-coverage panel, assert an `img` is present and loaded (`naturalWidth > 0`); skip if no project / no scene.

- [ ] **Step 6: Run e2e against live**

```bash
PLAYWRIGHT_BASE_URL=https://mtn-weather-web-771101720649.us-west1.run.app npx playwright test p11-satellite-image
```

- [ ] **Step 7: Visually confirm** via Playwright MCP — open Rainier's project on the deployed URL, screenshot the Snow-coverage panel, confirm the real scene renders (snowpack visible), both Glacier + Slate themes, desktop + mobile (390px).

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/p11-satellite-image.spec.ts
git commit -m "test(e2e): live satellite scene image renders"
```

---

## Final verification

- [ ] Full web gate green: `npm run build`, `npx vitest run --coverage` (≥90/90/85), `npm run test:e2e` live.
- [ ] Python gate green: `cd functions && pytest` (≥90%).
- [ ] `terraform -chdir=terraform validate` clean.
- [ ] All available scene images render live in both themes, desktop + mobile.
- [ ] Update CLAUDE.md progress log with a P11 entry (keep file < 250 lines).
