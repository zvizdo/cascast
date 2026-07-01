# Rename to "Cascast" — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm), ready for implementation plan
**Branch:** `feature/rename-cascast` (off `main`)

## Decision

Rename the product from its current inconsistent branding — **"Cirque"** (visible wordmark) / **"Mountain Weatherman"** (page title) — to a single name: **Cascast**.

- **Name:** Cascast (C‑A‑S‑C‑A‑S‑T)
- **Pronunciation:** "KASS‑kast" — *Cascade* + *cast*
- **Meaning:** Cascade(s) + (fore)cast. PNW-rooted, hints "mountain weather," coined and ownable (web search found no app/company/brand collision; intended to anchor a real `.com`).
- **Why not the alternatives:** *Snowline* has an existing outdoor-gear trademark twin (Korean traction-device brand) and a likely-taken domain; *Ridgeline* is crowded (Honda Ridgeline + Ridgeline of NZ apparel). *Cascast* is clean.

## Context

The app was **never public** — no users, no persisted production state. Therefore: **no data migration, no backwards-compatibility, no dual-read of old keys.** This is a clean find-and-replace.

## Scope

**In scope** (per user: "everything in the code and the README"):
- Active app source: `src/**`
- Tests: `tests/**` (unit + Playwright e2e)
- Python worker comments: `functions/**`
- `README.md`

**Out of scope (flagged as optional follow-up, not done here):**
- Historical design docs under `docs/**` (P0–P16 plans/specs, interface contract, the `prototype-ui/` archive) — dated historical records; renaming them is revisionist and low-value.
- `CLAUDE.md`, `references/add-mountain.md` — project meta/instructions, not "the code."

**Explicitly NOT renamed (infrastructure identifiers — renaming breaks deployments):**
- GCP project id `mountain-weatherman-app`, GCS bucket names, Firestore database, Terraform resource names, Cloud Run service names. These are hyphenated infra IDs, not brand strings; verified `terraform/` and `scripts/` contain no `Cirque`/`Mountain Weatherman` brand strings.

## What changes (authoritative inventory, base `main@d78f090`)

### 1. Visible brand + page metadata
- `src/components/layout/Header.tsx` — `aria-label="Cirque home"` → `"Cascast home"`; `<span className="brand-word">Cirque</span>` → `Cascast` (keep the `brand` / `brand-word` CSS class names).
- `src/app/layout.tsx` — `title: "Mountain Weatherman"` → `"Cascast"`.
- `src/app/sources/page.tsx` — title `"Models & sources — Mountain Weatherman"` → `"… — Cascast"`; description and body prose `"Mountain Weatherman blends…"` → `"Cascast blends…"`.

### 2. localStorage keys (no migration)
- `cirque.theme` → `cascast.theme`: `src/components/layout/ThemeToggle.tsx` (`KEY`) and `src/app/layout.tsx` (pre-paint inline script).
- `cirque.units` → `cascast.units`: `src/lib/units.ts` (zustand `persist` `name` + comment).
- `mw.pins` → `cascast.pins`: `src/lib/pins.ts` (`KEY`).

### 3. Tests updated in lockstep
- Unit: `src/components/layout/__tests__/Header.test.tsx` (`/cirque home/i`→`/cascast home/i`), `…/ThemeToggle.test.tsx` (`cirque.theme`), `src/lib/__tests__/units.test.ts` (`cirque.units`), `src/lib/__tests__/pins.test.ts` (`mw.pins`), `src/components/mountain/__tests__/MountainDetail.test.tsx` (`mw.pins`), `…/PinNotes.test.tsx` (`mw.pins`), `src/app/__tests__/tokens.test.ts` (`describe` label).
- e2e: `tests/e2e/nav.spec.ts` (`/cirque home/i`), and `mw.pins` in `your-mountains`, `hero-flip`, `shareable`, `pin-flow`, `daily-outlook-fixes`, `focused`.

### 4. Comments / descriptors
- `src/app/globals.css` header comment → "Cascast — mountain weather…"
- `src/components/shared/Skeleton.tsx` → "calm Cascast loading placeholders"
- `src/components/modellab/ModelInfo.tsx` → "Cascast mono styling"
- `functions/weather_worker/tone.py` — provenance comments referencing "the Cirque prototype" → "the original prototype" (drop the dead name without falsely claiming the prototype was called Cascast).

### 5. README.md
- Title `# Mountain Weatherman (Cirque)` → `# Cascast`; "user-approved **Cirque** design" → "**Cascast** design"; mermaid `Browser UI (Cirque)` → `Browser UI (Cascast)`.

## Success criteria
- `grep -rin "cirque\|mountain weatherman" src tests functions README.md` returns **zero** matches (case-insensitive).
- `npm run build` clean; full unit suite green (coverage gate 90/90/85 held); `functions/` pytest for `tone.py` green.
- Infra strings (`mountain-weatherman-app`, buckets, TF resources) **unchanged**.

## Non-goals
- No migration / no old-key fallback (never public).
- No domain purchase, wordmark/logo design, or tagline finalization (separate, later).
- No rename of historical docs, CLAUDE.md, or GCP/infra identifiers.
