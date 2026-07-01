# P0 — Foundation & Infra Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the repo, toolchain, local emulator harness, Terraform-managed GCP base infrastructure (APIs, IAM, buckets, Pub/Sub, scheduler, Firestore, monitoring), an empty Next.js app deploying to Firebase App Hosting, and the seeded `mountains` collection — so every later phase has a working, testable, deployable foundation.

**Architecture:** Monorepo with a Next.js 16 App Router frontend (`app/`, `lib/`), Python 3.12 Cloud Functions (`functions/`), and Terraform IaC (`terraform/`). Local development runs against the Firebase emulator suite (Firestore + Pub/Sub). GCP base resources are provisioned by Terraform; Cloud Functions themselves arrive in P1/P2 (scheduler jobs publish to topics that simply have no subscriber yet). No external weather APIs are touched in P0.

**Tech Stack:** Next.js 16.2.x (App Router, Turbopack default, React 19.2), TypeScript, Tailwind, Vitest, Playwright, Firebase Admin SDK, Python 3.12, pytest, Terraform 1.8 (google ~5.x), Firebase emulator suite, GitHub Actions. **Node 20.9+ required** (Next 16 minimum).

**Next.js 16 conventions** (apply in all phases): dynamic `params`/`searchParams` are **async** — `params` is a `Promise`, so Route Handlers and pages must `await params` (e.g. `async function GET(req, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; }`). GET Route Handlers are **uncached by default**; set caching explicitly via response `Cache-Control` headers (contract §7). `serverComponentsExternalPackages` is now the top-level `serverExternalPackages`.

**References:** `docs/superpowers/specs/2026-06-14-mountain-weather-poc-design.md` (spec) and `docs/superpowers/specs/2026-06-14-interface-contract.md` (contract). Section numbers below (e.g. "contract §2") refer to the contract.

**Prerequisites:** git repo initialized (done). `gcloud` authenticated as owner of `mountain-weatherman-app`. Node 20, Python 3.12, Terraform 1.8, Firebase CLI, and `gcloud` installed locally. A Mapbox token and CDSE OAuth client created (values can be placeholders in P0; only needed at P2/P4 runtime).

**Exit criteria:**
- `npm run build`, `npm test`, `npm run test:e2e` all pass locally.
- `cd functions && pytest` passes (P0 has only config + `shared/config.py` tests; coverage gate is informational until P1).
- `firebase emulators:exec` starts Firestore + Pub/Sub; `npm run seed:emulator` loads 10 mountains.
- `terraform -chdir=terraform validate` passes and `terraform plan -var-file=environments/dev.tfvars` shows the base resources with no errors.
- The empty Next.js app deploys to Firebase App Hosting and returns 200 at its URL.
- `mountains` collection in the real (dev) Firestore contains the 10 seed peaks.
- CI (`test.yml`) is green on a PR.

---

## File structure created in P0

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs` | Frontend toolchain |
| `vitest.config.ts`, `playwright.config.ts` | Test harness config |
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | Minimal Next.js app |
| `lib/env.ts`, `lib/firebase-admin.ts` | Typed env + Admin SDK singleton |
| `functions/pyproject.toml`, `functions/requirements*.txt`, `functions/conftest.py` | Python toolchain |
| `functions/shared/{__init__.py,config.py}` + tests | Worker config (resource names from contract §2) |
| `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` | Firebase + emulator config |
| `scripts/seed-mountains.ts`, `scripts/seed-emulator.ts` | Seed scripts (dataset from contract §10) |
| `terraform/**` | IaC: APIs, IAM, storage, pubsub, scheduler, firestore, monitoring |
| `.github/workflows/test.yml` | CI |
| `apphosting.yaml`, `.env.local.example` | Deploy + env template |

---

## Task 1: Frontend toolchain config

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.local.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "mountain-weatherman-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "emulators": "firebase emulators:start --only firestore,pubsub",
    "seed:emulator": "tsx scripts/seed-emulator.ts",
    "seed:mountains": "tsx scripts/seed-mountains.ts"
  },
  "dependencies": {
    "next": "16.2.7",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "firebase-admin": "12.7.0",
    "@google-cloud/pubsub": "4.9.0",
    "@google-cloud/storage": "7.14.0",
    "swr": "2.2.5",
    "zustand": "5.0.2",
    "d3": "7.9.0",
    "mapbox-gl": "3.9.0"
  },
  "devDependencies": {
    "typescript": "5.7.3",
    "@types/node": "20.17.0",
    "@types/react": "19.0.7",
    "@types/react-dom": "19.0.3",
    "@types/d3": "7.4.3",
    "tailwindcss": "3.4.17",
    "postcss": "8.5.1",
    "autoprefixer": "10.4.20",
    "vitest": "2.1.8",
    "@vitejs/plugin-react": "4.3.4",
    "@vitest/coverage-v8": "2.1.8",
    "@testing-library/react": "16.1.0",
    "@testing-library/jest-dom": "6.6.3",
    "jsdom": "25.0.1",
    "@playwright/test": "1.49.1",
    "tsx": "4.19.2",
    "eslint": "9.18.0",
    "eslint-config-next": "16.2.7"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "functions", "terraform"]
}
```

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16: top-level (was experimental.serverComponentsExternalPackages)
  serverExternalPackages: ["firebase-admin", "@google-cloud/pubsub", "@google-cloud/storage"],
};
export default nextConfig;
```

- [ ] **Step 4: Create `tailwind.config.ts` and `postcss.config.mjs`**

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

```js
// postcss.config.mjs
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

> Design tokens (colors/typography) are added in P4 via the `design-tokens` skill; P0 keeps Tailwind default.

- [ ] **Step 5: Create `.env.local.example`** (mirrors contract §2)

```bash
GCP_PROJECT=mountain-weatherman-app
GCS_BUCKET_WEATHER=mountain-weatherman-app-weather-data
FIREBASE_SERVICE_ACCOUNT=
TOPIC_WEATHER_REFRESH=projects/mountain-weatherman-app/topics/dev-weather-refresh
TOPIC_BACKFILL_REFRESH=projects/mountain-weatherman-app/topics/dev-backfill-refresh
TOPIC_NWAC_REFRESH=projects/mountain-weatherman-app/topics/dev-nwac-refresh
TOPIC_SNOTEL_REFRESH=projects/mountain-weatherman-app/topics/dev-snotel-refresh
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_EOX_ATTRIBUTION=Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data)
BROWSE_REFRESH_MODE=scheduled
FIRESTORE_EMULATOR_HOST=localhost:8080
PUBSUB_EMULATOR_HOST=localhost:8085
```

- [ ] **Step 6: Install and verify**

Run: `npm install`
Expected: completes; `node_modules/` present, no peer-dep errors that abort install.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs .env.local.example
git commit -m "chore(p0): frontend toolchain config"
```

---

## Task 2: Minimal Next.js app + build

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Create `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mountain Weatherman",
  description: "Unified mountain weather for Washington State hiking and mountaineering.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Mountain Weatherman</h1>
      <p data-testid="poc-status">POC foundation is live.</p>
    </main>
  );
}
```

- [ ] **Step 4: Verify the production build**

Run: `npm run build`
Expected: "Compiled successfully" and a route table listing `/`. Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "feat(p0): minimal Next.js app shell"
```

---

## Task 3: Test harness (Vitest + Playwright) with a smoke test

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `tests/e2e/home.spec.ts`, `lib/__tests__/smoke.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["{app,lib,components}/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/api/**", "lib/**", "components/**"],
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
```

- [ ] **Step 2: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write the failing smoke test**

```ts
// lib/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test`
Expected: 1 passed. (Coverage thresholds are not enforced on `vitest run` without `--coverage`; in P0 the included globs are empty so don't run `test:coverage` until P3.)

- [ ] **Step 5: Create `playwright.config.ts`** (desktop + mobile per contract §12)

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["iPhone 12"] } },
  ],
});
```

- [ ] **Step 5b: Install Playwright browsers**

Run: `npx playwright install --with-deps chromium`
Expected: chromium downloaded.

- [ ] **Step 6: Write the home e2e test with a screenshot**

```ts
// tests/e2e/home.spec.ts
import { test, expect } from "@playwright/test";

test("home page loads and shows POC status", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("poc-status")).toHaveText("POC foundation is live.");
  await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
});
```

- [ ] **Step 7: Run the e2e test**

Run: `npm run test:e2e`
Expected: 2 passed (desktop + mobile). Screenshots written under `test-results/`.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts vitest.setup.ts playwright.config.ts tests/ lib/__tests__/
git commit -m "test(p0): vitest + playwright harness with smoke tests"
```

---

## Task 4: `lib/env.ts` typed env access (TDD)

**Files:**
- Create: `lib/env.ts`, `lib/__tests__/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEnv, getBrowseRefreshMode } from "@/lib/env";

describe("requireEnv", () => {
  const OLD = process.env;
  beforeEach(() => { process.env = { ...OLD }; });
  afterEach(() => { process.env = OLD; });

  it("returns the value when set", () => {
    process.env.GCP_PROJECT = "mountain-weatherman-app";
    expect(requireEnv("GCP_PROJECT")).toBe("mountain-weatherman-app");
  });

  it("throws a descriptive error when missing", () => {
    delete process.env.GCP_PROJECT;
    expect(() => requireEnv("GCP_PROJECT")).toThrow(/Missing required env var: GCP_PROJECT/);
  });

  it("defaults browse refresh mode to scheduled", () => {
    delete process.env.BROWSE_REFRESH_MODE;
    expect(getBrowseRefreshMode()).toBe("scheduled");
  });

  it("reads lazy browse refresh mode", () => {
    process.env.BROWSE_REFRESH_MODE = "lazy";
    expect(getBrowseRefreshMode()).toBe("lazy");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/__tests__/env.test.ts`
Expected: FAIL — cannot find module `@/lib/env`.

- [ ] **Step 3: Implement `lib/env.ts`**

```ts
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") throw new Error(`Missing required env var: ${name}`);
  return v;
}

export type BrowseRefreshMode = "scheduled" | "lazy";

export function getBrowseRefreshMode(): BrowseRefreshMode {
  return process.env.BROWSE_REFRESH_MODE === "lazy" ? "lazy" : "scheduled";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/__tests__/env.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts lib/__tests__/env.test.ts
git commit -m "feat(p0): typed env access helper"
```

---

## Task 5: `lib/firebase-admin.ts` singleton (TDD against emulator)

**Files:**
- Create: `lib/firebase-admin.ts`, `lib/__tests__/firebase-admin.test.ts`

- [ ] **Step 1: Write the failing test** (asserts a single shared instance)

```ts
// lib/__tests__/firebase-admin.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.GCP_PROJECT = "mountain-weatherman-app";
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
});

describe("firebase-admin singleton", () => {
  it("returns the same Firestore instance across imports", async () => {
    const { getDb } = await import("@/lib/firebase-admin");
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/__tests__/firebase-admin.test.ts`
Expected: FAIL — cannot find module `@/lib/firebase-admin`.

- [ ] **Step 3: Implement `lib/firebase-admin.ts`**

```ts
import { initializeApp, getApps, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { requireEnv } from "@/lib/env";

let app: App | undefined;
let db: Firestore | undefined;

function getApp(): App {
  if (app) return app;
  if (getApps().length) { app = getApps()[0]; return app; }
  const projectId = requireEnv("GCP_PROJECT");
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  app = initializeApp({
    projectId,
    credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
  });
  return app;
}

export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getApp());
  return db;
}
```

- [ ] **Step 4: Run against the emulator to verify it passes**

Run: `firebase emulators:exec --only firestore "npm test -- lib/__tests__/firebase-admin.test.ts"`
Expected: 1 passed. (Requires `firebase.json` from Task 7; if running before Task 7, set `FIRESTORE_EMULATOR_HOST` and the import-identity assertion still passes without a live emulator since it does not perform I/O.)

- [ ] **Step 5: Commit**

```bash
git add lib/firebase-admin.ts lib/__tests__/firebase-admin.test.ts
git commit -m "feat(p0): firebase-admin Firestore singleton"
```

---

## Task 6: Python toolchain + `shared/config.py` (TDD)

**Files:**
- Create: `functions/pyproject.toml`, `functions/requirements.txt`, `functions/requirements-dev.txt`, `functions/conftest.py`, `functions/shared/__init__.py`, `functions/shared/config.py`, `functions/shared/tests/__init__.py`, `functions/shared/tests/test_config.py`

- [ ] **Step 1: Create `functions/pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["."]
asyncio_mode = "auto"
markers = ["live: hits real external APIs (deselected by default)"]
addopts = [
  "--cov=.",
  "--cov-report=term-missing",
  "--cov-report=xml:coverage.xml",
  "--cov-fail-under=90",
  "-m", "not live",
  "-v",
]

[tool.coverage.run]
source = ["."]
omit = ["*/tests/*", "*/__init__.py", "conftest.py", "*/requirements*.txt"]

[tool.coverage.report]
exclude_lines = ["if __name__ == .__main__.:", "pragma: no cover", "raise NotImplementedError"]
```

> Note: `--cov-fail-under=90` is set now but P0 only adds `shared/config.py` (fully tested), so the gate passes. Later phases keep it green.

- [ ] **Step 2: Create `functions/requirements.txt` and `functions/requirements-dev.txt`**

```text
# functions/requirements.txt  (runtime, shared across workers)
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-pubsub==2.23.0
google-cloud-storage==2.18.0
httpx==0.27.0
pydantic==2.8.2
tenacity==9.0.0
```

```text
# functions/requirements-dev.txt
-r requirements.txt
pytest==8.3.2
pytest-cov==5.0.0
pytest-mock==3.14.0
pytest-httpx==0.30.0
pytest-asyncio==0.23.8
```

- [ ] **Step 3: Create package files**

```python
# functions/shared/__init__.py
```
```python
# functions/shared/tests/__init__.py
```

- [ ] **Step 4: Write the failing test** for `shared/config.py`

```python
# functions/shared/tests/test_config.py
import importlib
import pytest
from shared import config

def test_project_defaults(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "mountain-weatherman-app")
    monkeypatch.setenv("ENV", "dev")
    importlib.reload(config)
    assert config.GCP_PROJECT == "mountain-weatherman-app"
    assert config.ENV == "dev"

def test_topic_path_builds_full_path(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "mountain-weatherman-app")
    importlib.reload(config)
    assert config.topic_path("weather-refresh") == \
        "projects/mountain-weatherman-app/topics/dev-weather-refresh"

def test_require_env_raises(monkeypatch):
    monkeypatch.delenv("CDSE_CLIENT_ID", raising=False)
    importlib.reload(config)
    with pytest.raises(RuntimeError, match="Missing required env var: CDSE_CLIENT_ID"):
        config.require_env("CDSE_CLIENT_ID")
```

- [ ] **Step 5: Run to verify it fails**

Run: `cd functions && pytest shared/tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.config'`.

- [ ] **Step 6: Implement `functions/shared/config.py`** (resource names per contract §2)

```python
import os

GCP_PROJECT = os.environ.get("GCP_PROJECT", "mountain-weatherman-app")
ENV = os.environ.get("ENV", "dev")
GCS_BUCKET_WEATHER = os.environ.get("GCS_BUCKET_WEATHER", f"{GCP_PROJECT}-weather-data")
GCS_BUCKET_SATELLITE = os.environ.get("GCS_BUCKET_SATELLITE", f"{GCP_PROJECT}-satellite-tiles")

def topic_path(logical_name: str) -> str:
    """Full Pub/Sub topic path, e.g. 'weather-refresh' -> projects/<p>/topics/dev-weather-refresh."""
    return f"projects/{GCP_PROJECT}/topics/{ENV}-{logical_name}"

def require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd functions && pytest shared/tests/test_config.py -v`
Expected: 3 passed.

- [ ] **Step 8: Create `functions/conftest.py`** (shared fixtures per contract §12)

```python
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

@pytest.fixture
def load_fixture():
    def _load(name: str) -> dict:
        return json.loads((FIXTURES / name).read_text())
    return _load

@pytest.fixture
def mock_db():
    with patch("firebase_admin.firestore.client") as m:
        yield m.return_value

@pytest.fixture
def mock_publisher():
    with patch("google.cloud.pubsub_v1.PublisherClient") as m:
        yield m.return_value

@pytest.fixture
def mock_storage_client():
    with patch("google.cloud.storage.Client") as m:
        yield m.return_value

@pytest.fixture
def sample_mountain_doc():
    return {
        "slug": "mt-rainier", "name": "Mount Rainier",
        "lat": 46.8517, "lng": -121.7603,
        "elevations": {"base": 5420, "mid": 10188, "summit": 14410},
        "nwacZone": "west-slopes-south", "nwacZoneId": "1648",
        "snotelStationId": "679", "snotelStationTriplet": "679:WA:SNTL",
        "snotelStationName": "Paradise", "region": "cascades-south",
        "timezone": "America/Los_Angeles",
    }

@pytest.fixture
def sample_active_project(sample_mountain_doc):
    return {
        "id": "proj-abc", "mountainId": "mt-rainier", "status": "active",
        "targetDateStart": "2026-08-02", "targetDateEnd": "2026-08-03",
        "mountainName": "Mount Rainier", "mountainSlug": "mt-rainier",
    }
```

- [ ] **Step 9: Run the full Python suite (coverage gate)**

Run: `cd functions && pytest`
Expected: 3 passed, coverage ≥ 90% (only `shared/config.py` is counted; conftest/tests omitted).

- [ ] **Step 10: Commit**

```bash
git add functions/
git commit -m "feat(p0): python toolchain, shared config, pytest fixtures"
```

---

## Task 7: Firebase + emulator config

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`

- [ ] **Step 1: Create `.firebaserc`**

```json
{ "projects": { "default": "mountain-weatherman-app" } }
```

- [ ] **Step 2: Create `firestore.rules`** (POC: public read, server-only writes — contract §3)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if false; // Admin SDK bypasses rules; clients cannot write
    }
  }
}
```

- [ ] **Step 3: Create `firestore.indexes.json`** (contract §3)

```json
{
  "indexes": [
    {
      "collectionGroup": "projects",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "targetDateEnd", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "weatherSnapshots",
      "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "fetchedAt", "order": "DESCENDING" }]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 4: Create `firebase.json`** (emulators per contract §12)

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "firestore": { "port": 8080 },
    "pubsub": { "port": 8085 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 5: Verify the emulator starts**

Run: `firebase emulators:exec --only firestore,pubsub "echo emulators-ok"`
Expected: emulators boot and print `emulators-ok`, then shut down cleanly. Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json
git commit -m "feat(p0): firebase config + firestore/pubsub emulators"
```

---

## Task 8: Seed scripts (`mountains` dataset) — TDD against emulator

**Files:**
- Create: `lib/mountains-data.ts` (the contract §10 dataset), `scripts/seed-mountains.ts`, `scripts/seed-emulator.ts`, `lib/__tests__/mountains-data.test.ts`

- [ ] **Step 1: Create `lib/mountains-data.ts`** — paste the full `MOUNTAINS` literal from contract §10.

```ts
import type { Mountain } from "@/lib/types"; // types.ts added in P3; until then this import is unused at runtime
export const MOUNTAINS = [
  /* ... paste the complete 10-element array from interface-contract §10 verbatim ... */
] as const;
```

> When executing: copy the exact array from `docs/superpowers/specs/2026-06-14-interface-contract.md` §10. Do not abbreviate. (The `@/lib/types` import is added in P3; in P0 replace with a local inline type to keep `tsx` happy — see Step 3.)

- [ ] **Step 2: Write the failing data-integrity test**

```ts
// lib/__tests__/mountains-data.test.ts
import { describe, it, expect } from "vitest";
import { MOUNTAINS } from "@/lib/mountains-data";

const NWAC_ZONE_IDS = new Set(["1645","1646","1647","1648","1649","1653","1654","1655","1656","1657"]);

describe("seed mountains dataset", () => {
  it("has exactly 10 peaks", () => { expect(MOUNTAINS).toHaveLength(10); });

  it("has unique slugs", () => {
    const slugs = MOUNTAINS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(10);
  });

  it("each peak has valid coords, elevations, zone id, and IANA timezone", () => {
    for (const m of MOUNTAINS) {
      expect(m.lat).toBeGreaterThan(44); expect(m.lat).toBeLessThan(49.5);
      expect(m.lng).toBeLessThan(-119); expect(m.lng).toBeGreaterThan(-124.5);
      expect(m.elevations.summit).toBeGreaterThan(m.elevations.mid);
      expect(m.elevations.mid).toBeGreaterThan(m.elevations.base);
      expect(NWAC_ZONE_IDS.has(m.nwacZoneId)).toBe(true);
      expect(m.snotelStationTriplet).toMatch(/^\d+:(WA|OR):SNTL$/);
      expect(m.timezone).toBe("America/Los_Angeles");
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails, then make it pass**

Run: `npm test -- lib/__tests__/mountains-data.test.ts`
Expected first: FAIL (module missing / array empty). Paste the full dataset (Step 1). For P0, define a local `Mountain` type inline at the top of `mountains-data.ts` to avoid the P3 `lib/types.ts` dependency:

```ts
type Mountain = {
  name: string; slug: string; lat: number; lng: number;
  elevations: { base: number; mid: number; summit: number };
  nwacZone: string; nwacZoneId: string; snotelStationId: string;
  snotelStationTriplet: string; snotelStationName: string;
  region: string; timezone: string; description: string;
};
export const MOUNTAINS: readonly Mountain[] = [ /* full §10 array */ ];
```
Re-run: Expected: 3 passed.

- [ ] **Step 4: Create `scripts/seed-mountains.ts`** (writes to Firestore — emulator or real)

```ts
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MOUNTAINS } from "../lib/mountains-data";

function db() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp({
      projectId: process.env.GCP_PROJECT ?? "mountain-weatherman-app",
      credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
    });
  }
  return getFirestore();
}

export async function seedMountains() {
  const firestore = db();
  const batch = firestore.batch();
  for (const m of MOUNTAINS) {
    const ref = firestore.collection("mountains").doc(m.slug);
    batch.set(ref, { ...m, createdAt: new Date() }, { merge: true });
  }
  await batch.commit();
  return MOUNTAINS.length;
}

if (process.argv[1] && process.argv[1].endsWith("seed-mountains.ts")) {
  seedMountains()
    .then((n) => { console.log(`Seeded ${n} mountains.`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 5: Create `scripts/seed-emulator.ts`** (local convenience: seed mountains + a sample project)

```ts
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { seedMountains } from "./seed-mountains";

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Refusing to seed: FIRESTORE_EMULATOR_HOST is not set (emulator only).");
  }
  if (!getApps().length) initializeApp({ projectId: "mountain-weatherman-app" });
  const firestore = getFirestore();
  const n = await seedMountains();
  await firestore.collection("projects").doc("sample-rainier").set({
    name: "Rainier — Demo Weekend", mountainId: "mt-rainier",
    mountainName: "Mount Rainier", mountainSlug: "mt-rainier",
    targetDateStart: "2026-08-02", targetDateEnd: "2026-08-03",
    status: "active", notes: "", createdAt: new Date(),
    lastRefreshedAt: null, lastRefreshStatus: "pending",
  }, { merge: true });
  console.log(`Emulator seeded: ${n} mountains + 1 sample project.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Verify seeding against the emulator**

Run:
```bash
firebase emulators:exec --only firestore "FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed:emulator"
```
Expected: `Emulator seeded: 10 mountains + 1 sample project.` Exit code 0.

- [ ] **Step 7: Commit**

```bash
git add lib/mountains-data.ts lib/__tests__/mountains-data.test.ts scripts/
git commit -m "feat(p0): seed mountains dataset + emulator/real seed scripts"
```

---

## Task 9: Terraform — backend, providers, API enablement

**Files:**
- Create: `terraform/backend.tf`, `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf`, `terraform/environments/dev.tfvars`, `terraform/environments/prod.tfvars`

- [ ] **Step 1: Create the state bucket once (manual bootstrap)**

Run: `gcloud storage buckets create gs://mountain-weatherman-app-tfstate --location=us-west1 --project=mountain-weatherman-app --uniform-bucket-level-access`
Expected: bucket created (or "already exists" — acceptable).

- [ ] **Step 2: Create `terraform/backend.tf`**

```hcl
terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.40" }
  }
  backend "gcs" {
    bucket = "mountain-weatherman-app-tfstate"
    prefix = "terraform/state"
  }
}
```

- [ ] **Step 3: Create `terraform/variables.tf`**

```hcl
variable "project_id" { type = string }
variable "region"     { type = string, default = "us-west1" }
variable "env"        { type = string }
variable "budget_billing_account" { type = string, default = "" }
```

- [ ] **Step 4: Create `terraform/main.tf`** (providers + API enablement + module wiring)

```hcl
provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com", "cloudscheduler.googleapis.com",
    "pubsub.googleapis.com", "firestore.googleapis.com", "storage.googleapis.com",
    "eventarc.googleapis.com", "run.googleapis.com", "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com", "firebase.googleapis.com",
    "iam.googleapis.com", "secretmanager.googleapis.com", "monitoring.googleapis.com",
    "billingbudgets.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "firestore" {
  source     = "./modules/firestore"
  project_id = var.project_id
  region     = var.region
  depends_on = [google_project_service.required_apis]
}

module "storage" {
  source     = "./modules/storage"
  project_id = var.project_id
  region     = var.region
  env        = var.env
  depends_on = [google_project_service.required_apis]
}

module "pubsub" {
  source     = "./modules/pubsub"
  project_id = var.project_id
  env        = var.env
  depends_on = [google_project_service.required_apis]
}

module "iam" {
  source     = "./modules/iam"
  project_id = var.project_id
  env        = var.env
  depends_on = [google_project_service.required_apis]
}

module "scheduler" {
  source             = "./modules/scheduler"
  region             = var.region
  env                = var.env
  orchestrate_topic  = module.pubsub.orchestrate_topic_id
  depends_on         = [google_project_service.required_apis]
}

module "monitoring" {
  source          = "./modules/monitoring"
  project_id      = var.project_id
  env             = var.env
  dlq_topic       = module.pubsub.dlq_topic_id
  billing_account = var.budget_billing_account
  depends_on      = [google_project_service.required_apis]
}
```

- [ ] **Step 5: Create `terraform/outputs.tf`**

```hcl
output "weather_bucket"   { value = module.storage.weather_bucket_name }
output "satellite_bucket" { value = module.storage.satellite_bucket_name }
output "source_bucket"    { value = module.storage.source_bucket_name }
output "orchestrate_topic"{ value = module.pubsub.orchestrate_topic_id }
```

- [ ] **Step 6: Create tfvars**

```hcl
# terraform/environments/dev.tfvars
project_id = "mountain-weatherman-app"
region     = "us-west1"
env        = "dev"
budget_billing_account = ""   # fill with billing account id to enable budget alerts
```
```hcl
# terraform/environments/prod.tfvars
project_id = "mountain-weatherman-app"
region     = "us-west1"
env        = "prod"
budget_billing_account = ""
```

- [ ] **Step 7: Commit** (validation happens after modules exist in Task 10)

```bash
git add terraform/backend.tf terraform/main.tf terraform/variables.tf terraform/outputs.tf terraform/environments/
git commit -m "feat(p0): terraform backend, providers, api enablement"
```

---

## Task 10: Terraform modules (storage, pubsub, iam, firestore, scheduler, monitoring)

**Files:** Create `terraform/modules/{firestore,storage,pubsub,iam,scheduler,monitoring}/main.tf` (+ `variables.tf`, `outputs.tf` as shown).

- [ ] **Step 1: `modules/firestore`**

```hcl
# modules/firestore/variables.tf
variable "project_id" { type = string }
variable "region"     { type = string }
```
```hcl
# modules/firestore/main.tf
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}

# Native TTL on weatherSnapshots.expireAt (contract §3 / spec §6)
resource "google_firestore_field" "snapshots_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "weatherSnapshots"
  field      = "expireAt"
  ttl_config {}
}
```

- [ ] **Step 2: `modules/storage`** (private buckets + lifecycle, contract §2)

```hcl
# modules/storage/variables.tf
variable "project_id" { type = string }
variable "region"     { type = string }
variable "env"        { type = string }
```
```hcl
# modules/storage/main.tf
locals { prefix = var.project_id }

resource "google_storage_bucket" "weather" {
  name                        = "${local.prefix}-weather-data"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"
  lifecycle_rule {
    condition { age = 35, matches_prefix = ["forecasts/"] }
    action    { type = "Delete" }
  }
}

resource "google_storage_bucket" "satellite" {
  name                        = "${local.prefix}-satellite-tiles"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"
}

resource "google_storage_bucket" "source" {
  name                        = "${local.prefix}-function-source"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"
}
```
```hcl
# modules/storage/outputs.tf
output "weather_bucket_name"   { value = google_storage_bucket.weather.name }
output "satellite_bucket_name" { value = google_storage_bucket.satellite.name }
output "source_bucket_name"    { value = google_storage_bucket.source.name }
```

- [ ] **Step 3: `modules/pubsub`** (topics + DLQ, contract §2)

```hcl
# modules/pubsub/variables.tf
variable "project_id" { type = string }
variable "env"        { type = string }
```
```hcl
# modules/pubsub/main.tf
locals {
  topics = ["orchestrate", "weather-refresh", "backfill-refresh",
            "nwac-refresh", "snotel-refresh", "satellite-refresh"]
}

resource "google_pubsub_topic" "dlq" {
  name = "${var.env}-refresh-dlq"
}

resource "google_pubsub_topic" "topics" {
  for_each = toset(local.topics)
  name     = "${var.env}-${each.value}"
}
```
```hcl
# modules/pubsub/outputs.tf
output "orchestrate_topic_id" { value = google_pubsub_topic.topics["orchestrate"].id }
output "dlq_topic_id"         { value = google_pubsub_topic.dlq.id }
output "topic_ids"            { value = { for k, t in google_pubsub_topic.topics : k => t.id } }
```

- [ ] **Step 4: `modules/iam`** (per-worker service accounts + role bindings)

```hcl
# modules/iam/variables.tf
variable "project_id" { type = string }
variable "env"        { type = string }
```
```hcl
# modules/iam/main.tf
locals {
  workers = ["orchestrator", "weather-worker", "backfill-worker",
             "nwac-worker", "snotel-worker", "satellite-worker"]
}

resource "google_service_account" "workers" {
  for_each     = toset(local.workers)
  account_id   = "${var.env}-${each.value}"
  display_name = "${var.env} ${each.value}"
}

# Roles each worker SA needs (datastore + storage + pubsub publisher + token creator for eventarc)
resource "google_project_iam_member" "datastore" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/datastore.user"
  member   = "serviceAccount:${each.value.email}"
}
resource "google_project_iam_member" "storage" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${each.value.email}"
}
resource "google_project_iam_member" "pubsub_pub" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/pubsub.publisher"
  member   = "serviceAccount:${each.value.email}"
}
```
```hcl
# modules/iam/outputs.tf
output "sa_emails" { value = { for k, sa in google_service_account.workers : k => sa.email } }
```

- [ ] **Step 5: `modules/scheduler`** (4 jobs, contract §2)

```hcl
# modules/scheduler/variables.tf
variable "region"            { type = string }
variable "env"               { type = string }
variable "orchestrate_topic" { type = string }
```
```hcl
# modules/scheduler/main.tf
resource "google_cloud_scheduler_job" "weather" {
  name      = "${var.env}-weather-orchestrate"
  region    = var.region
  schedule  = "0 * * * *"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "weather" }))
  }
  retry_config { retry_count = 1 }
}

resource "google_cloud_scheduler_job" "nwac" {
  name      = "${var.env}-nwac-orchestrate"
  region    = var.region
  schedule  = "*/15 7-11 * * *" # 07:00–11:45 PT; idempotent skip makes early ticks no-ops
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "nwac" }))
  }
  retry_config { retry_count = 1 }
}

resource "google_cloud_scheduler_job" "snotel" {
  name      = "${var.env}-snotel-orchestrate"
  region    = var.region
  schedule  = "0 7 * * *"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "snotel" }))
  }
}

resource "google_cloud_scheduler_job" "satellite" {
  name      = "${var.env}-satellite-orchestrate"
  region    = var.region
  schedule  = "0 8 * * 0"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "satellite" }))
  }
}
```

- [ ] **Step 6: `modules/monitoring`** (budget alerts + DLQ alert, spec §2 #15-17)

```hcl
# modules/monitoring/variables.tf
variable "project_id"      { type = string }
variable "env"             { type = string }
variable "dlq_topic"       { type = string }
variable "billing_account" { type = string }
```
```hcl
# modules/monitoring/main.tf
# Budget alerts ($10 / $25) — only created when a billing account id is provided.
resource "google_billing_budget" "budget" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "${var.env}-mtn-weather-budget"
  budget_filter { projects = ["projects/${var.project_id}"] }
  amount { specified_amount { currency_code = "USD", units = "25" } }
  threshold_rules { threshold_percent = 0.4 }  # $10
  threshold_rules { threshold_percent = 1.0 }  # $25
}

# Alert when DLQ has undelivered messages (worker failures).
resource "google_monitoring_alert_policy" "dlq" {
  display_name = "${var.env}-refresh-dlq-backlog"
  combiner     = "OR"
  conditions {
    display_name = "DLQ has messages"
    condition_threshold {
      filter = "resource.type=\"pubsub_topic\" AND resource.label.topic_id=\"${var.env}-refresh-dlq\" AND metric.type=\"pubsub.googleapis.com/topic/send_message_operation_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations { alignment_period = "300s", per_series_aligner = "ALIGN_SUM" }
    }
  }
}
```

- [ ] **Step 7: Validate Terraform**

Run:
```bash
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 8: Plan against dev (real GCP, read-only)**

Run:
```bash
terraform -chdir=terraform init   # with backend
terraform -chdir=terraform plan -var-file=environments/dev.tfvars
```
Expected: a plan that creates APIs, Firestore DB + TTL, 3 buckets, 7 topics, 6 SAs + bindings, 4 scheduler jobs, 1 DLQ alert (budget skipped if billing id empty). No errors.

- [ ] **Step 9: Apply to dev**

Run: `terraform -chdir=terraform apply -var-file=environments/dev.tfvars`
Expected: apply completes; `terraform output` lists bucket + topic names.

- [ ] **Step 10: Commit**

```bash
git add terraform/modules/
git commit -m "feat(p0): terraform modules (storage, pubsub, iam, firestore, scheduler, monitoring)"
```

---

## Task 11: CI workflow (`test.yml`)

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create `.github/workflows/test.yml`**

```yaml
name: Tests
on:
  pull_request:
  push: { branches: [main] }

jobs:
  python:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: functions } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: "pip" }
      - run: pip install -r requirements-dev.txt
      - run: pytest

  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: "1.8.5" }
      - run: terraform -chdir=terraform init -backend=false
      - run: terraform -chdir=terraform validate
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yml')); print('valid')"`
Expected: `valid`.

- [ ] **Step 3: Commit and push a PR; confirm CI is green**

```bash
git add .github/workflows/test.yml
git commit -m "ci(p0): test workflow (python, web, terraform)"
git push -u origin <branch>   # open a PR
```
Expected: all three CI jobs pass on the PR. (Requires the GitHub repo + remote to exist — see deploy gate.)

---

## Task 12: Firebase App Hosting deploy config

**Files:**
- Create: `apphosting.yaml`

- [ ] **Step 1: Create `apphosting.yaml`** (App Hosting build/runtime config)

```yaml
runConfig:
  minInstances: 0
  maxInstances: 2
env:
  - variable: GCP_PROJECT
    value: mountain-weatherman-app
  - variable: BROWSE_REFRESH_MODE
    value: scheduled
```

- [ ] **Step 2: Connect App Hosting to the GitHub repo (one-time, console/CLI)**

Run (interactive, the user performs this): `firebase apphosting:backends:create --project mountain-weatherman-app`
Then connect the GitHub repo + `main` branch in the prompts.
Expected: a backend is created and the first deploy is triggered from `main`.

> If `firebase apphosting` is unavailable in the installed CLI version, do this in the Firebase console (Build → App Hosting → Get started → connect repo). Document the resulting backend URL in the README.

- [ ] **Step 3: Verify the deployed app responds**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://<apphosting-backend-url>/`
Expected: `200`.

- [ ] **Step 4: Commit**

```bash
git add apphosting.yaml
git commit -m "feat(p0): firebase app hosting config"
```

---

## Task 13: Seed real (dev) Firestore + P0 verification gate

- [ ] **Step 1: Seed the 10 mountains into the real dev Firestore**

Run:
```bash
GOOGLE_APPLICATION_CREDENTIALS=<sa-key.json> GCP_PROJECT=mountain-weatherman-app npm run seed:mountains
```
Expected: `Seeded 10 mountains.`

- [ ] **Step 2: Verify the data landed**

Run: `gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/mountains" --limit=20 2>/dev/null | grep -c "mt-\|glacier\|colchuck\|liberty" || true`
Alternatively confirm in the Firebase console that `mountains` has 10 docs.
Expected: 10 mountain documents present.

- [ ] **Step 3: Run the full local gate**

Run:
```bash
npm run build && npm test && npm run test:e2e
( cd functions && pytest )
terraform -chdir=terraform validate
firebase emulators:exec --only firestore,pubsub "FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed:emulator"
```
Expected: every command exits 0; Playwright shows 2 passed with screenshots in `test-results/`.

- [ ] **Step 4: Confirm exit criteria** (check each box in the plan header's Exit criteria). Note any deviations in the PR description.

- [ ] **Step 5: Final commit / merge**

```bash
git add -A
git commit -m "chore(p0): foundation complete — infra, app shell, emulator, seed, CI"
```

---

## Verification gate (P0 done when all true)
- `npm run build` ✓ · `npm test` ✓ · `npm run test:e2e` ✓ (desktop+mobile screenshots)
- `cd functions && pytest` ✓ (coverage ≥90% on the single tested module)
- `terraform validate` ✓ · `terraform plan` (dev) clean ✓ · `terraform apply` (dev) ✓
- Emulator boots; `seed:emulator` loads 10 mountains + sample project ✓
- App Hosting deploy returns 200 ✓
- Real dev Firestore `mountains` has 10 docs ✓
- CI green on PR ✓

## Rollback / notes
- `terraform destroy -var-file=environments/dev.tfvars` tears down dev infra (buckets use `force_destroy` in dev).
- App Hosting backend deletion is manual (console) — not Terraform-managed in the POC (seed plan §13).
- **Open risk:** `firebase apphosting` CLI surface varies by version; the console fallback is documented in Task 12.
- **Deferred to P1+:** Cloud Functions (the `functions` Terraform module) — scheduler jobs publish to topics with no subscribers until then, which is expected and harmless.
```
