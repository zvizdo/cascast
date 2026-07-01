# Rename to "Cascast" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product's user-facing brand and all in-code/test/README references from "Cirque"/"Mountain Weatherman" to a single name, **Cascast**.

**Architecture:** A clean find-and-replace across active source, tests, Python worker comments, and the README. The app was never public, so localStorage keys are renamed with **no migration** and **no old-key fallback**. Infrastructure identifiers (GCP project, buckets, Terraform resources) are deliberately untouched.

**Tech Stack:** Next 16 / React 19 (TS/TSX), Vitest + Testing Library, Playwright e2e, Python 3.12 Cloud Functions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-rename-cascast-design.md` — the contract for this work.
- New name is exactly **Cascast** (capitalized) / **cascast** (lowercase in keys & aria text). Replace `Cirque`→`Cascast`, `cirque`→`cascast`, `Mountain Weatherman`→`Cascast`.
- localStorage keys: `cirque.theme`→`cascast.theme`, `cirque.units`→`cascast.units`, `mw.pins`→`cascast.pins`. **No migration / no dual-read** (never public).
- **Do NOT rename infrastructure**: GCP project `mountain-weatherman-app`, GCS buckets, Firestore db, Terraform resource/service names. (Verified `terraform/` & `scripts/` contain no brand strings.)
- **Out of scope**: historical `docs/**` (plans/specs/`prototype-ui/` archive), `CLAUDE.md`, `references/add-mountain.md`.
- Keep CSS class names `brand` / `brand-word` (structural, not brand text).
- TDD where a test exists: update the test expectation first (RED), then change source (GREEN). Coverage gate 90/90/85 must stay green.
- Test runner: `npx vitest run --config config/vitest.config.ts <path>` (single), `npm test` / `npm run test:coverage` (full). Build: `npm run build`.

---

### Task 1: Visible brand + page metadata

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/app/layout.tsx` (title only — line 31)
- Modify: `src/app/sources/page.tsx`
- Test: `src/components/layout/__tests__/Header.test.tsx`
- Test (e2e): `tests/e2e/nav.spec.ts`

**Interfaces:**
- Produces: the home link's accessible name becomes `"Cascast home"`; the wordmark text becomes `Cascast`; the browser tab title becomes `Cascast`. Later tasks and other tests rely on these exact strings.

- [ ] **Step 1: Update the unit test expectations (RED)**

In `src/components/layout/__tests__/Header.test.tsx`, change both occurrences (lines ~20 and ~56):

```tsx
expect(screen.getByRole("link", { name: /cascast home/i })).toHaveAttribute("href", "/");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/components/layout/__tests__/Header.test.tsx`
Expected: FAIL — no link named "cascast home" (Header still says "Cirque").

- [ ] **Step 3: Update `Header.tsx`**

Change the two brand strings:

```tsx
        <Link href="/" className="brand" aria-label="Cascast home">
```
```tsx
          <span className="brand-word">Cascast</span>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/components/layout/__tests__/Header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update page metadata + prose**

In `src/app/layout.tsx` (line 31):

```tsx
  title: "Cascast",
```

In `src/app/sources/page.tsx` — the `title`, the `description`, and the body sentence:

```tsx
  title: "Models & sources — Cascast",
```
```tsx
    "How Cascast blends weather models (HRRR, GFS, ECMWF) and which external data sources it draws on.",
```
```tsx
          Cascast blends a few numerical weather models and several public data
```

- [ ] **Step 6: Update the e2e nav spec to match the new aria-label**

In `tests/e2e/nav.spec.ts` (line ~22):

```ts
  await page.getByRole("link", { name: /cascast home/i }).click();
```

- [ ] **Step 7: Verify the affected unit tests + build**

Run: `npx vitest run --config config/vitest.config.ts src/components/layout/__tests__/Header.test.tsx src/app/__tests__/sources.test.tsx`
Expected: PASS (no test asserts the old "Mountain Weatherman" strings).
Run: `npm run build`
Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/Header.tsx src/app/layout.tsx src/app/sources/page.tsx src/components/layout/__tests__/Header.test.tsx tests/e2e/nav.spec.ts
git commit -m "refactor(rename): Cascast brand in Header, page titles, sources"
```

---

### Task 2: localStorage key rename (no migration)

**Files:**
- Modify: `src/components/layout/ThemeToggle.tsx` (`KEY`)
- Modify: `src/app/layout.tsx` (pre-paint inline script — line ~53)
- Modify: `src/lib/units.ts` (zustand `persist` name + comment)
- Modify: `src/lib/pins.ts` (`KEY`)
- Test: `src/components/layout/__tests__/ThemeToggle.test.tsx`, `src/lib/__tests__/units.test.ts`, `src/lib/__tests__/pins.test.ts`, `src/components/mountain/__tests__/MountainDetail.test.tsx`, `src/components/mountain/__tests__/PinNotes.test.tsx`
- Test (e2e): `tests/e2e/{your-mountains,hero-flip,shareable,pin-flow,daily-outlook-fixes,focused}.spec.ts`

**Interfaces:**
- Produces: persisted keys become `cascast.theme`, `cascast.units`, `cascast.pins`. All readers/writers of these keys (source + tests) must use the new strings.

- [ ] **Step 1: Update all unit-test key expectations (RED)**

Replace every old key literal with the new one:
- `src/components/layout/__tests__/ThemeToggle.test.tsx` (lines ~16, ~19, ~40): `"cirque.theme"` → `"cascast.theme"`
- `src/lib/__tests__/units.test.ts` (line ~42): `"cirque.units"` → `"cascast.units"`
- `src/lib/__tests__/pins.test.ts` (lines ~29, ~45): `"mw.pins"` → `"cascast.pins"`
- `src/components/mountain/__tests__/MountainDetail.test.tsx` (line ~148): `"mw.pins"` → `"cascast.pins"`
- `src/components/mountain/__tests__/PinNotes.test.tsx` (lines ~13, ~34): `"mw.pins"` → `"cascast.pins"`

- [ ] **Step 2: Run those tests to verify they fail**

Run: `npx vitest run --config config/vitest.config.ts src/components/layout/__tests__/ThemeToggle.test.tsx src/lib/__tests__/units.test.ts src/lib/__tests__/pins.test.ts src/components/mountain/__tests__/MountainDetail.test.tsx src/components/mountain/__tests__/PinNotes.test.tsx`
Expected: FAIL — source still reads/writes the old keys.

- [ ] **Step 3: Update the source keys**

`src/components/layout/ThemeToggle.tsx` (line 6):
```tsx
const KEY = "cascast.theme";
```
`src/app/layout.tsx` (inline script, line ~53) — change the key inside the template string:
```tsx
            __html: `try{var t=localStorage.getItem("cascast.theme");if(t==="slate"||t==="glacier")document.documentElement.dataset.theme=t;}catch(e){}`,
```
`src/lib/units.ts` — comment (line ~70) and the persist name (line ~89):
```ts
// ---------- Zustand store (persisted to localStorage "cascast.units") ----------
```
```ts
      name: "cascast.units",
```
`src/lib/pins.ts` (line 11):
```ts
const KEY = "cascast.pins";
```

- [ ] **Step 4: Run those tests to verify they pass**

Run: `npx vitest run --config config/vitest.config.ts src/components/layout/__tests__/ThemeToggle.test.tsx src/lib/__tests__/units.test.ts src/lib/__tests__/pins.test.ts src/components/mountain/__tests__/MountainDetail.test.tsx src/components/mountain/__tests__/PinNotes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the e2e specs that seed/read `mw.pins`**

In each of these files, replace every `"mw.pins"` with `"cascast.pins"`:
`tests/e2e/your-mountains.spec.ts`, `tests/e2e/hero-flip.spec.ts`, `tests/e2e/shareable.spec.ts`, `tests/e2e/pin-flow.spec.ts`, `tests/e2e/daily-outlook-fixes.spec.ts`, `tests/e2e/focused.spec.ts`.

Verify none remain: `grep -rn '"mw\.pins"' tests/e2e` → no output.

- [ ] **Step 6: Run the full unit suite + build**

Run: `npm test`
Expected: full suite green.
Run: `npm run build`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/ThemeToggle.tsx src/app/layout.tsx src/lib/units.ts src/lib/pins.ts src/components/layout/__tests__/ThemeToggle.test.tsx src/lib/__tests__/units.test.ts src/lib/__tests__/pins.test.ts src/components/mountain/__tests__/MountainDetail.test.tsx src/components/mountain/__tests__/PinNotes.test.tsx tests/e2e/your-mountains.spec.ts tests/e2e/hero-flip.spec.ts tests/e2e/shareable.spec.ts tests/e2e/pin-flow.spec.ts tests/e2e/daily-outlook-fixes.spec.ts tests/e2e/focused.spec.ts
git commit -m "refactor(rename): localStorage keys to cascast.* (no migration)"
```

---

### Task 3: Comments, descriptors, README, test label

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/shared/Skeleton.tsx`
- Modify: `src/components/modellab/ModelInfo.tsx`
- Modify: `functions/weather_worker/tone.py`
- Modify: `src/app/__tests__/tokens.test.ts` (describe label)
- Modify: `README.md`

**Interfaces:** none (comments, a test label, and docs only — no behavior change).

- [ ] **Step 1: Update the source comments + descriptors**

`src/app/globals.css` (line 5):
```css
/* Cascast — mountain weather. Cool-alpine editorial system. */
```
`src/components/shared/Skeleton.tsx` (line 1) — change "Cirque" to "Cascast":
```tsx
/* Skeleton — calm Cascast loading placeholders (P6 Task 3). Shimmer respects
```
`src/components/modellab/ModelInfo.tsx` (line 3) — change "Cirque mono styling" to "Cascast mono styling":
```tsx
   thing distinguishing the models. Cascast mono styling (P8 A2). */
```

- [ ] **Step 2: Update the Python provenance comments (drop the dead name)**

`functions/weather_worker/tone.py`:
- Line 3:
```python
Scoring is ported verbatim from the original prototype's data.js summarize():
```
- Line 13:
```python
    """Map a raw score to a tone label (Favorable/Marginal/Hazardous)."""
```

- [ ] **Step 3: Update the test describe label**

`src/app/__tests__/tokens.test.ts` (line 7):
```ts
describe("globals.css — Cascast design tokens", () => {
```

- [ ] **Step 4: Update the README**

`README.md`:
- Line 1: `# Cascast`
- Line ~20: `Recreates the user-approved **Cascast** design` (keep the rest of the sentence/path unchanged)
- Line ~96 (mermaid): `API --> UI["Browser UI (Cascast)<br/>Search · Browse · Focused (?target) · Your Mountains · Model Lab"]`

- [ ] **Step 5: Verify (test label + python import + build)**

Run: `npx vitest run --config config/vitest.config.ts src/app/__tests__/tokens.test.ts`
Expected: PASS (comment in globals.css doesn't change token values).
Run: `cd functions && python -c "import weather_worker.tone" && cd ..` (or run the tone test file if present: `cd functions && pytest -k tone -p no:cov -o addopts="" && cd ..`)
Expected: imports / tests cleanly (comment-only change).
Run: `npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/shared/Skeleton.tsx src/components/modellab/ModelInfo.tsx functions/weather_worker/tone.py src/app/__tests__/tokens.test.ts README.md
git commit -m "refactor(rename): Cascast in comments, README, token test label"
```

---

### Task 4: Final verification gate

**Files:** none (verification only).

- [ ] **Step 1: Confirm zero residual brand strings in active code**

Run: `grep -rin "cirque\|mountain weatherman" src tests functions README.md`
Expected: **no output** (zero matches).

- [ ] **Step 2: Confirm infra was NOT touched**

Run: `grep -rin "cirque\|mountain weatherman" terraform scripts`
Expected: no output (and `mountain-weatherman-app` infra IDs remain — these are the hyphenated project/bucket names, which we never target).

- [ ] **Step 3: Full coverage suite**

Run: `npm run test:coverage`
Expected: all tests pass; coverage ≥ 90/90/85.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: (Optional, if environment allows) route-mocked e2e**

Run: `npm run test:e2e`
Expected: green — confirms the renamed aria-label (`nav.spec.ts`) and `cascast.pins` seeding work end-to-end. (Heavy; may be deferred to a live QA pass.)

- [ ] **Step 6: Final commit (only if verification produced fixes)**

```bash
git add -A
git commit -m "test(rename): final verification — zero residual brand strings"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Visible brand+metadata → Task 1; localStorage keys (no migration) → Task 2; comments/descriptors/README/test-label → Task 3; success-criteria grep + gates → Task 4. Infra-untouched is enforced by Task 4 Step 2 and by never listing infra files. Out-of-scope docs are simply not referenced.

**Placeholder scan:** none — every step has exact strings/paths/commands.

**Type consistency:** the three new key literals (`cascast.theme`, `cascast.units`, `cascast.pins`) and the brand strings (`Cascast`, `cascast home`) are used identically across Tasks 1–4 and the success-criteria grep.
