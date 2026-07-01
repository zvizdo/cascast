# Mobile UI Polish — Design Spec (2026-06-21)

## Goal
Make the **mobile responsive** UI ~99% faithful to the original Cirque prototype
(`docs/prototype-ui/prototype-design-review/`). Fix the alignment/spacing/badge issues and
the two functional render bugs (freezing-hero blank, map/3D "renders nothing") surfaced by a
visual QA sweep. Desktop must not regress.

## Method that produced this spec
A gated capture spec (`tests/e2e/qa-mobile-polish.spec.ts`, `QA_POLISH=1`) screenshotted all
9 page-states full-page across **3 widths (360 / 390 / 412)** × **both themes (slate dark /
glacier light)** → `qa-screenshots/polish/` (54 PNGs, route-mocked). Five parallel `ux-reviewer`
agents catalogued issues per tile against the prototype + `src/app/globals.css` tokens.

## Locked decisions
1. **Freezing hero:** keep the 3D flip card on all viewports; **fix the flip CSS** so the 2D
   front face paints and the back face is fully hidden on touch (do NOT flatten on mobile).
2. **Mobile header:** compact bar — collapse the 3 units segmenteds + theme toggle into a
   compact control/menu; keep brand + Search + Your Mountains visible; **hide the redundant
   "Pin a Peak" CTA on the home route**. Target a 1–2 row bar. Nav stays reachable on mobile.
3. **Scope:** P0 + P1 + P2 (all findings, including ~25 nits).

## Conventions
- Severity: **P0** = broken/blank/overflow · **P1** = clear misalignment (the "badges don't
  align" / "tiles touching" complaints) · **P2** = nit.
- Most fixes live in `src/app/globals.css` (single style file) + targeted component className/
  structure tweaks. TDD for logic changes (map resize, 3D error states). Visual changes verified
  by **re-running the QA capture + ux-review + live spot-check**.
- Touch-target floor: **≥44px** under `@media (pointer:coarse)`.
- New cross-cutting primitive: a **safe-area page gutter** — fold `env(safe-area-inset-*)` into
  the existing `.page`/`.detail-body`/`.lab-body` gutters + `.appbar` + footer, and add
  `viewport-fit=cover` to the viewport meta. (Currently `env(safe-area-inset-*)` appears nowhere.)

---

## Workstream A — Global shell & safe-area (affects all 6 routes)
| # | Issue | Sev | Where |
|---|---|---|---|
| A1 | No `env(safe-area-inset-*)` anywhere; sticky appbar bg + footer ignore notch/home-indicator | P1 | `globals.css` `.appbar`:140, `.page`:189/544/584, `.app-footer`:740; viewport meta in `src/app/layout.tsx` |
| A2 | Mobile header wraps to 3 rows (~150px) | P1 | `Header.tsx:27-48`, `globals.css:180-186` |
| A3 | Redundant "Pin a Peak" CTA links to current page on `/` | P1 | `Header.tsx:43-45` |
| A4 | Units (3 segmenteds) + theme should collapse into a compact control/menu on mobile | P1 | `Header.tsx`, `UnitsToggle.tsx`, `ThemeToggle.tsx` |
| A5 | Page mastheads inconsistent: `.home-search` + `.dash-head` are **unstyled**, `.page-head` has `margin-bottom:30px` | P2 | `page.tsx:18`, `your-mountains/page.tsx:15`, `globals.css:190` |
| A6 | `.empty` uses `padding:80px 24px` — too tall at 360 | P2 | `globals.css:318` |

**Acceptance:** appbar + content + footer respect safe-area on notched devices; mobile header ≤2
rows; no home-page CTA no-op; identical masthead rhythm across home/your-mountains/sources.

## Workstream B — Forecast tab (freezing hero + badge alignment)
| # | Issue | Sev | Where |
|---|---|---|---|
| B1 | **Freezing-hero 2D front face renders blank on mobile** (flip-card 3D context) | P0 | `Mountain3DCard.tsx:54-71`, `globals.css:816-832` `.xflip*` |
| B2 | **"Explore in 3D" back face bleeds through mirrored** (backface not hidden unflipped) | P0 | `Mountain3DCard.tsx:72-92`, `globals.css:832-836` |
| B3 | **Wind badge row misaligns** — `{" "}` whitespace flex nodes + `.wind-pill` line-height (THE "badges don't align" complaint) | P1 | `DailyOutlook.tsx:419-433`, `globals.css:424,435` |
| B4 | "Target" flag overlaps the "Morning" tile label | P1 | `DailyOutlook.tsx:402`, `globals.css:429`,`:414` |
| B5 | "Feels like 36°" wraps to 2 lines → ragged tile heights | P2 | `DailyOutlook.tsx:414-418` |
| B6 | "Summit · 14,410 ft · daytime high/overnight low" wraps at 360 | P2 | `DailyOutlook.tsx:231-258` |
| B7 | AM·Mid·PM horizontal scroll has no fade affordance | P2 | `DailyOutlook.tsx:288-290`, `globals.css:398` |
| B8 | CallChart `°F` axis-unit label collides with top tick | P2 | `CallChart.tsx` |

**Acceptance:** freezing cross-section paints on every mobile width/theme; no mirrored bleed; the
day-tile wind row (`↙ ≋ 12 g24`) shares one vertical center with even gaps; no flag/label overlap.

## Workstream C — Safety tab (crowding + badges; user complaint #1)
| # | Issue | Sev | Where |
|---|---|---|---|
| C1 | **No vertical gap between stacked Safety panels** — "tiles touching the safety band" | P0 | `MountainDetail.tsx:222-253` fragment, `globals.css:968` `.mtab-panel` |
| C2 | Avalanche DangerChip orphans left-aligned below the title on mobile | P1 | `AvalanchePanel.tsx:47`, `globals.css:570` |
| C3 | AQI hero "80" vertically centered vs 2-line label (should baseline-align) | P1 | `AirQualityPanel.tsx:33-45`, `globals.css:972` |
| C4 | Danger meter rows `54px 1fr auto` + nowrap tag squeeze the meter at 360 | P1 | `DangerColumn.tsx:23-39`, `globals.css:218` |
| C5 | Park-alert **emoji** glyphs break baseline + theme | P1 | `ParkAlertsPanel.tsx:12-20` |
| C6 | Seismic rows don't truncate long place names | P1 | `SeismicPanel.tsx:13-21`, `globals.css:978` |
| C7 | Seismic "Swarm" badge uses ad-hoc radius/padding (inconsistent pill) | P2 | `SeismicPanel.tsx:55-61` |
| C8 | AspectRose fixed `size=108`; N/E/S/W ticks at `font 9` near floor | P2 | `AvalanchePanel.tsx:68`, `AspectRose.tsx:55-57` |
| C9 | Avalanche bottom-line inline `maxWidth:360` magic number | P2 | `AvalanchePanel.tsx:60` |
| C10 | Storm alert dot uses hard-coded `marginTop:4` for baseline | P2 | `StormPanel.tsx:24-30` |
| C11 | Repeated inline `marginTop:14` provenance footer across 5 panels | P2 | AirQuality:64/Storm:73/Volcano:64/Seismic:71/ParkAlerts:66 |
| C12 | Light-theme danger tokens (`--d2/--d3` + white text) — verify AA | P1(a11y) | `globals.css:212-215`, `DangerChip` |

**Acceptance:** consistent ~22px rhythm between every Safety panel (matching `.detail-grid` gap);
danger chip reads as a deliberate part of the header; AQI number aligns to its label; danger meters
keep full width at 360; emoji replaced with the monochrome `Icons` set; seismic rows truncate.

## Workstream D — Terrain & Access + /3d (functional render bugs; complaint #3)
| # | Issue | Sev | Where |
|---|---|---|---|
| D1 | **Map blanks on tab switch / toggle** — no `map.resize()`/ResizeObserver; built once per tab-mount | P0 | `TerrainMap.tsx:157-198`, `MountainTabs.tsx:105` |
| D2 | **`setStyle()` base/snow toggle wipes layers**, re-add races on `style.load` | P1 | `TerrainMap.tsx:180-182` |
| D3 | **/3d transient meta error → permanent "3D model not available"** dead-end | P0 | `hooks.ts:213-224`, `Explore3D.tsx:105-111` |
| D4 | **GLB load failure → invisible `null` fallback** (blank canvas, toggles still show) | P1 | `Mountain3D.tsx:121-128` |
| D5 | Layer-toggle checkboxes <44px touch + ragged wrap ("Earthquakes" orphans) | P1 | `globals.css:996`, `TerrainAccess.tsx:88-112` |
| D6 | MODIS caption competes on the toggle wrap line | P2 | `TerrainAccess.tsx:98-100` |
| D7 | `/3d` mandatory disclaimer only below the canvas (not visible without scroll) | P1 | `Explore3D.tsx:175-181` |
| D8 | `/3d` toggle labels uneven ("Slope angle (30–45°)" much wider) → ragged rows | P2 | `Explore3D.tsx:114-134` |
| D9 | `/3d` disabled toggles rely on desktop-only `title`; no inline reason on touch | P1 | `Explore3D.tsx:66-83,121-133` |
| D10 | Hero-flip `.xflip-back`/`.xflip-stage` can resolve to ~0 height → blank canvas | P1 | `globals.css:833-841`, `Mountain3DCard.tsx:70-88` |
| D11 | Access cards repeat the "ACCESS" kicker ×3; long mobile scroll | P2 | `AccessCards.tsx:35-58` |
| D12 | Webcam strip `overflow-x:auto` 240px cards, no scroll-fade | P2 | `globals.css:985-987`, `WebcamStrip.tsx:62` |
| D13 | Topo/Satellite sub-toggle + layer cluster read as two disconnected widgets | P2 | `TerrainAccess.tsx:80-112` |

**Acceptance (live-verified):** switching to the Terrain tab and toggling base/snow/layers always
shows the map; `/3d` shows the model (or a *retryable* error, never a permanent dead-end on a
transient failure); layer toggles are ≥44px pills that wrap cleanly; disclaimer visible at the canvas.

## Workstream E — Model Lab (charts + touch targets)
| # | Issue | Sev | Where |
|---|---|---|---|
| E1 | `.modeltag` chips + "About the models" toggle are sub-44px touch targets | P1 | `ModelLab.tsx:68`, `ModelInfo.tsx:57`, `globals.css:719-731` |
| E2 | Hourly-grid scroll-fade mask **always on** — dims sticky label col + first hour even when no overflow | P1 | `globals.css:518-522`, `HourlyGrid.tsx:66` |
| E3 | Chart axis text scales to ~6px at 360 (whole `viewBox 640×…` SVG scales `width:100%`) | P1 | `LineChart.tsx:35,84-114`, `ModelCharts.tsx:106-145` |
| E4 | Freezing-level 5-digit tick labels clip the 40px left pad at 360 | P1 | `LineChart.tsx:35`, `ModelCharts.tsx:126-135` |
| E5 | Header model chips wrap into a tall noisy block (`res` sub-labels) at 360/390 | P1 | `ModelLab.tsx:65-98` |
| E6 | Wind-threshold pill sits in the model legend → looks like a 4th model | P2 | `ModelCharts.tsx:184-188` |
| E7 | Sticky target-row label `--surface` overrides `--target-band` tint | P2 | `globals.css:515-517`, `HourlyGrid.tsx:77-79` |
| E8 | Hour `<th>` lack `scope="col"`; generic `position:sticky` mis-applied to all `th` | P2 | `globals.css:514`, `HourlyGrid.tsx:71-73` |
| E9 | Overloaded `△` glyph (hot temp AND high wind); distinct glyphs clearer | P2 | `HourlyGrid.tsx:42,95,113` |
| E10 | Intro mono block (lat/lng/TZ) dominates the first viewport | P2 | `ModelLab.tsx:104-117` |
| E11 | Light-theme gridlines + faded series (`opacity .35`) wash out | P2 | `globals.css` `--line`, `LineChart.tsx:152` |
| E12 | "About the models" `<dl>` long GFS source string may overflow card at 360 | P2 | `ModelInfo.tsx:66-72,111-114` |

**Acceptance:** all Model-Lab controls ≥44px touch; chart axis labels legible at 360 (no clipping);
hourly-grid fade only when it actually overflows and never dims the sticky column.

---

## Cross-cutting acceptance criteria
- Re-run `QA_POLISH=1` capture → reviewed screenshots clean at 360/390/412 × both themes; no P0/P1
  remaining; P2s addressed or explicitly deferred with reason.
- Map / Terrain / 3D render reliably on toggle — **verified against the live URL** (the bug doesn't
  fully reproduce in route-mocked mode).
- All quality gates green: `npm run build`, `npm test` (coverage ≥90/90/85), `npm run test:e2e`
  (desktop + mobile), `terraform -chdir=terraform validate` (unaffected).
- Desktop (1280×800) unchanged — spot-check before/after.
- Final ux-review APPROVE (or APPROVE_WITH_FIXES with blockers fixed).

## Execution
Subagent-driven: one implementer per workstream (A–E), each reads its section here + the prototype +
`globals.css`, makes surgical changes, runs the relevant gates, then a `ux-reviewer` pass + fix loop.
Workstream A (shell/safe-area) lands first (shared CSS primitive the others build on). B/C/D/E are
largely independent (different components) and can pipeline. The detailed task plan is produced next
via the writing-plans skill.
