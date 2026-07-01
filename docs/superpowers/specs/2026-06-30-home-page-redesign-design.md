# Home Page Redesign — Search + Browse-by-Region

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan
**Scope:** The `/` home route only (`src/app/page.tsx`) plus one new helper and one new component. No API, pipeline, or nav/branding changes.

## Problem

The current home page (`src/app/page.tsx`) is a bare `MountainSearch` box captioned "find a **Washington** peak." Two problems:

1. A first-time visitor doesn't learn what the app is, that it covers **Washington and Oregon** (not just WA), or that it's built on **free, public data**.
2. Nothing conveys the offering at a glance — you must already know a peak's name and type it. There is no way to discover the catalog.

## Goal

Make a first-time visitor understand — quickly and intuitively — (a) what Cascast is, (b) that it's a **Washington & Oregon** alpine-weather tool, and (c) that it runs on **free open data**, while still supporting the fast "I know my peak" path via search. Decided model: **explain, then browse.**

## Design (approved via visual mockup)

The reference mockup is `.superpowers/brainstorm/59874-1782876689/content/home-layout.html` (rendered faithfully in Cirque tokens). The page is a single client component (`"use client"`, needs `useUnits`/`useMountains`) with three stacked regions inside the standard `.page` / `1180px` container.

### 1. Hero (editorial, left-aligned)

- **Kicker** (mono, accent): `Free alpine weather · Washington & Oregon`
- **Title** (serif H1, `.page-title` scale): "Mountain weather for the **Pacific Northwest**" (second phrase italic serif).
- **Sub** (`.page-sub`, one sentence): a single honest read on the Cascades, Olympics, and Oregon volcanoes — freezing level, wind, avalanche danger, snowpack — built entirely on free, public data.
- **Search**: reuse the existing `MountainSearch` component unchanged (same `onSelect` → `router.push('/mountains/[slug]')`, `minQueryLength={3}`). Reframed by a caption: "Know the peak? Jump straight to it. Or **browse by region** below."
- **Ridge silhouette**: a subtle, layered SVG ridgeline behind the hero (theme-aware fills, low opacity, `pointer-events:none`, `aria-hidden`) for instant "alpine" recognition. Approved as a keeper.

### 2. Feature strip (three props)

A single bordered rounded strip divided into three cells, each with a mono eyebrow + one-line value:

| Eyebrow | Value |
|---|---|
| COVERAGE | Washington & Oregon alpine peaks |
| DATA | Free, public sources → (links to `/sources`) |
| FORECAST | Multiple weather models, blended |

Collapses to stacked/wrapped rows on narrow widths.

### 3. Browse by region

Region-grouped grids fed by the bundled `MOUNTAINS` catalog constant (`src/lib/mountains-data.ts`) — **no network calls**. Top-level grouping is **WA / Oregon / Beyond**:

- **Washington** — one region heading with a short grey note, then four mono sub-labels, each over its own card grid:
  - **North Cascades** — `region: "cascades-north"`
  - **Central Cascades · Enchantments** — `region: "cascades-central"`
  - **South Cascades** — `region: "cascades-south"`
  - **Olympics** — `region: "olympics"`
- **Oregon** — `region: "oregon"` (single grid, no sub-labels). Note flags that NWAC avalanche coverage thins south of Mount Hood.
- **Beyond the Northwest** — `region: "sierra-nevada"` (Mount Whitney). Note: weather + satellite only, no avalanche/SNOTEL feed.

**Region note** (small grey sentence under each region heading): kept — approved as helpful context, not clutter.

**Sort:** within every group, peaks are sorted by **summit elevation, descending**.

**Card** (whole card is a `<Link href="/mountains/[slug]">`, lifts on hover):
- Name — serif, ~18px.
- Summit elevation — mono accent, **unit-aware** via `fmtDist(m.elevations.summit, dist)` with `dist` from `useUnits((s) => s.dist)`; a small mono "SUMMIT" tag.
- One-line descriptor — the mountain's `description`, clamped to 2 lines (`-webkit-line-clamp`).

Grid: `repeat(auto-fill, minmax(232px, 1fr))`. Every peak in the catalog renders (Washington is the tallest section).

## Components & structure

Keep `page.tsx` thin; extract the browse logic so it's independently testable.

- **`src/lib/regions.ts`** (new) — the single source of the region display model. Maps each `Mountain.region` string to `{ group, subLabel, note?, order }` and provides a helper that partitions `MOUNTAINS` into the ordered `WA / Oregon / Beyond` structure with each group's peaks sorted by summit elevation desc. Pure, no React → unit-tested directly. Handles the case of an unknown/new region string gracefully (falls into a default/last group rather than being dropped).
- **`src/components/home/MountainBrowse.tsx`** (new) — renders the region sections + sub-labels + card grid from the `regions.ts` output. Client component (needs `useUnits` for the elevation unit). The card is its own small piece (inline or a tiny `MountainCard`).
- **`src/app/page.tsx`** (edit) — hero (kicker/title/sub + ridge SVG + `MountainSearch`) + feature strip + `<MountainBrowse />`.
- **Styles** — added to `src/app/globals.css` using existing tokens only (no literals): hero, ridge, `.feat`/strip, region/sub-label, and mountain-card classes. Follow the existing responsive breakpoints (≤900 / ≤680).

## Copy cleanup (in scope, home only)

The home search sub-copy currently says "find a **Washington** peak" — updated to Washington & Oregon framing (superseded by the new hero sub). The `your-mountains` page's "Washington Cascades" kicker is **out of scope** (separate page) unless requested separately.

## Out of scope

- Live conditions / condition dots on cards (static essentials only — decided).
- Header/nav or brand changes; the `/sources` page content itself.
- Any API, Firestore, pipeline, or Terraform change.
- A search/filter box over the browse grid, sort toggle, or region jump-links (not requested; YAGNI).

## Testing (quality gates stay green)

- **`regions.ts`** — unit tests: every `MOUNTAINS` region maps to a group; groups are in `WA → Oregon → Beyond` order; within each group peaks are summit-desc sorted; an unknown region string is placed, not dropped; Whitney lands in "Beyond the Northwest".
- **`MountainBrowse`** — render test (route-mocked): all four WA sub-labels render, Oregon and Beyond sections render, a known peak card shows its name + `SUMMIT` elevation + links to `/mountains/<slug>`, and elevation respects the units toggle (ft ↔ m).
- **`page.tsx`** — render test: kicker/title/sub present, `MountainSearch` present, feature strip's Data cell links to `/sources`.
- **e2e (route-mocked, desktop + mobile)** — home renders hero + strip + region sections; clicking a browse card navigates to the peak; search still routes to a peak. Coverage floors (90/90/85) held; `three/**`-style exclusions not needed here.

## Success criteria

1. A visitor landing on `/` reads, without scrolling, that this is free WA & Oregon alpine weather.
2. Every catalog peak is browsable, grouped WA / Oregon / Beyond, each card linking to its focused view.
3. Search still works as the fast path.
4. `npm run build`, `npm test` (coverage held), and `npm run test:e2e` stay green; visual parity with the approved mockup in both Glacier and Slate themes, desktop and mobile.
