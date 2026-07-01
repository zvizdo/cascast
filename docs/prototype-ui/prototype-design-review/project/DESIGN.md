# Cirque — Design System & Specification

> **Cirque** is a unified mountain-weather dashboard for Washington State hikers and
> mountaineers. Pin a peak and a target date; the app aggregates weather, avalanche,
> and snowpack data so you can read your window at a glance — then drill into
> aviation-grade detail when you want precision.
>
> This document is the canonical design reference for the prototype: principles,
> tokens, components, information architecture, and the decisions behind them.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Information Architecture](#2-information-architecture)
3. [The Two-Layer Model](#3-the-two-layer-model)
4. [Typography](#4-typography)
5. [Color System](#5-color-system)
6. [Themes](#6-themes)
7. [Spacing, Radius & Elevation](#7-spacing-radius--elevation)
8. [Iconography](#8-iconography)
9. [Components](#9-components)
10. [Signature View — Freezing Level Cross-Section](#10-signature-view--freezing-level-cross-section)
11. [Daily Outlook — Progressive Granularity](#11-daily-outlook--progressive-granularity)
12. [Charts & Data Visualization](#12-charts--data-visualization)
13. [Screens](#13-screens)
14. [Interaction & Motion](#14-interaction--motion)
15. [Responsive Behavior](#15-responsive-behavior)
16. [Accessibility](#16-accessibility)
17. [Tweaks (Theme Controls)](#17-tweaks-theme-controls)
18. [Code Architecture](#18-code-architecture)
19. [Mock Data Model](#19-mock-data-model)
20. [Open Questions & Future Work](#20-open-questions--future-work)

---

## 1. Design Principles

Cirque's aesthetic is **calm, editorial, and cool-alpine** — closer to a well-set
magazine than a dashboard product. Five principles govern every decision:

1. **Read at a glance, then drill down.** The first thing a user sees on any screen
   answers the question they came with ("is my window on?"). Detail is always one
   deliberate step deeper — never forced up front.
2. **Honesty about uncertainty.** A forecast is a range, not a number. The product
   surfaces model agreement/disagreement and scopes high-resolution data (hourly,
   HRRR) to the window where it is actually skillful.
3. **Quiet surfaces, loud data.** Chrome recedes (hairline borders, generous
   whitespace, muted neutrals) so the numbers, lines, and the mountain itself carry
   the visual weight.
4. **Editorial voice.** Headlines are written, not labeled ("The call for Saturday,"
   "The days around your window"). The verdict is a sentence, not a status pill.
5. **One system, many densities.** The same tokens and components serve a serene
   marketing-grade dashboard *and* an aviation-style data grid. Density is a setting,
   not a redesign.

**Anti-goals:** gradient soup, decorative emoji, neon dashboards, faux-3D weather
glyphs, data slop (numbers/badges that don't drive a decision).

---

## 2. Information Architecture

```
/  (Projects / Dashboard)
│   At-a-glance cards, one per pinned objective.
│
├── /projects/new  (Pin a Peak)
│     Typeahead peak search · target window · notes.
│
└── /projects/[id]  (Project Detail — the calm layer)
      1. Verdict ............ "The call for Saturday" + 3 key stats
      2. Daily Outlook ...... day → AM/Mid/PM → hourly (progressive)
      3. Freezing Level ..... signature cross-section
      4. Confidence ......... model agreement strip
      5. Avalanche .......... NWAC danger + problems + roses
      6. Snowpack ........... SNOTEL depth/SWE + 30-day trend
      7. Satellite + Notes .. Sentinel-2 tile + plan
      │
      └── /projects/[id]/models  (Model Lab — the drill-down layer)
            Multi-model charts · forecast evolution · hourly grid
```

Navigation is intentionally flat. There is no auth, no settings, no account menu —
every URL is shareable as-is (a core POC tenet). The global header carries only the
wordmark, two nav links (Projects, Peaks), and **Pin a Peak**.

---

## 3. The Two-Layer Model

The product's defining structure. Every data domain exists at two fidelities:

| | **Calm layer** (Project Detail) | **Drill-down layer** (Model Lab) |
|---|---|---|
| Audience | Anyone planning a trip | Detail-oriented / experienced |
| Reading time | Seconds | Minutes |
| Type | Editorial serif + sans | Monospace, tabular |
| Charts | Curated, smoothed, labeled | Dense multi-model, raw grids |
| Voice | "Cold window holds before a front" | `Δ16°F at target`, `POP %`, `g104` |
| Entry | Default | Explicit "drill down" affordance |

The calm layer never hides the drill-down — every panel offers a `drill-link`
("Open full hourly grid & raw data," "Compare all models →"). The transition is a
deliberate gear-change, signaled by a wholesale shift to monospace and tabular
density in the Model Lab.

---

## 4. Typography

Three families, each with a job. Loaded from Google Fonts.

| Role | Family | Usage |
|---|---|---|
| **Display / headline** | **Newsreader** (serif, 400–600 + italic) | Page titles, panel headings, the verdict sentence, big stat values. Carries the editorial tone. |
| **UI / body** | **Hanken Grotesk** (400–700) | Navigation, labels, body copy, buttons. A warm humanist grotesk — neutral without being Helvetica/Inter. |
| **Data / instrument** | **IBM Plex Mono** (400–600) | All numerals in context (elevations, temps, wind), kickers, axis labels, the entire Model Lab. Reads as an instrument readout. |

```css
--serif: "Newsreader", Georgia, serif;
--sans:  "Hanken Grotesk", system-ui, sans-serif;
--mono:  "IBM Plex Mono", ui-monospace, monospace;
```

**Type scale (approximate, px):**

| Token | Size | Family | Use |
|---|---|---|---|
| Page title | 40 / 30 (mobile) | serif 500 | `/` and screen H1 |
| Section title | 24 | serif 500 | Panel headings |
| Stat value | 30 / 22 | serif 500 | Headline numbers |
| Body | 15–16 | sans 400 | Paragraphs, notes |
| Label | 13–14 | sans 500–600 | Controls, nav |
| Kicker | 11 | mono 500, 0.12em, uppercase | Eyebrow labels |
| Data | 10.5–12.5 | mono 400–600 | Tables, axes, chips |

**Rules:** numbers that represent measured quantities are monospace; numbers that are
*editorial* (a headline stat) are serif. Kickers are always mono-uppercase with
tracking. `text-wrap: pretty` on long editorial paragraphs.

---

## 5. Color System

Cool-alpine: subtly-cooled whites and slates, a single glacier-blue accent, and the
standardized NWAC avalanche danger scale. Saturation is kept low everywhere except
danger states and data series.

### Neutrals & accent (Glacier / light)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#e9eef3` | App background (cool gray-blue) |
| `--surface` | `#ffffff` | Cards, panels |
| `--surface-2` | `#f5f8fb` | Insets, secondary fills |
| `--surface-3` | `#eef3f7` | Active nav, tertiary |
| `--ink` | `#1b2935` | Primary text (slate) |
| `--ink-2` | `#33444f` | Secondary text |
| `--muted` | `#6a7b8a` | Tertiary text, axes |
| `--faint` | `#9aa9b5` | Quaternary / disabled |
| `--line` | `#e2e8ee` | Hairline borders |
| `--line-strong` | `#cdd8e1` | Input borders, dividers |
| `--accent` | `#2c6d8f` | Glacier blue — links, primary, data |
| `--accent-2` | `#347ca2` | Accent hover |
| `--accent-soft` | `#e6eff4` | Accent tint backgrounds |
| `--target-band` | `rgba(44,109,143,.09)` | Target-window highlight |

### Condition tone (project verdict)

| Token | Value | Meaning |
|---|---|---|
| `--good` | `#3f8f6b` | Favorable window |
| `--caution` | `#c98a2e` | Marginal — manageable with care |
| `--alert` | `#c5503f` | Hazardous — stand-down |

Tone is computed (see [§19](#19-mock-data-model)) from wind, gusts, precip,
avalanche danger, and cold, then surfaced as a dot + word ("Favorable / Marginal /
Hazardous"), never a raw score.

### Avalanche danger (NWAC standard)

The North American Public Avalanche Danger Scale — used verbatim because the labels
are NWAC's:

| Level | Token | Color | Label |
|---|---|---|---|
| 1 | `--d1` | `#4e9c52` green | Low |
| 2 | `--d2` | `#ecc531` yellow | Moderate |
| 3 | `--d3` | `#ef8a26` orange | Considerable |
| 4 | `--d4` | `#df3a2f` red | High |
| 5 | `--d5` | `#1d1d1d` black | Extreme |

### Cross-section gradient tokens

The Freezing Level hero composites its mountain from theme-aware gradient stops so it
re-skins cleanly between Glacier and Slate:

```
--snow-hi / --snow-lo   snow cap (above freezing line)
--rock-hi / --rock-lo   rock face (below freezing line)
--rock-line             ridgeline texture strokes
--ridge-stroke          mountain outline
--sky-hi / --sky-lo     atmosphere above the line
--below-fl              warm earth band below the line
```

---

## 6. Themes

Two curated themes, both inside the cool-alpine family, selected via `[data-theme]`
on the root element:

- **Glacier** (default, light) — snow-white grounds, slate ink, glacier-blue accent.
  The marketing-grade, daytime planning view.
- **Slate** (dark, "night-ops") — deep blue-black grounds, brighter accent
  (`#5cabd8`), snow-capped peaks glowing against a dark sky. For low-light use and to
  make charts pop.

Every token has a Slate override; components reference tokens only, never literals,
so theming is total and free. Danger colors are nearly identical across themes
(safety-critical — they must stay recognizable), with only black (`--d5`) deepened.

---

## 7. Spacing, Radius & Elevation

**Spacing** follows a loose 4px rhythm; panels breathe (24px internal padding,
20–22px gaps between sections). Whitespace is a primary design material here — when in
doubt, add air.

**Radius**

| Token | Value | Use |
|---|---|---|
| `--radius` | 14px | Cards, panels |
| `--radius-sm` | 9px | Buttons, inputs, chips |

**Elevation** — three soft, cool-tinted shadow steps. Shadows are restrained; borders
do most of the separation work.

```css
--shadow-sm  /* resting cards */
--shadow     /* hover, hero */
--shadow-lg  /* lifted cards, popovers */
```

In Slate, shadows deepen (black-based) to read on dark grounds.

**Layout widths:** content max-width `1180px` (calm layer), `1320px` (Model Lab — wider
for tabular data). Page gutters 28px desktop / 18px mobile.

---

## 8. Iconography

A single hand-built line-icon set (`app/icons.jsx`), 24×24, 1.6 stroke,
`currentColor`, round caps/joins. Weather icons map WMO codes → `sun / partly /
cloud / rain / snow / fog`. Wind direction renders as a rotatable arrow glyph.

**Rules:** icons are line-only and geometric; no filled illustrative weather glyphs.
Nothing more complex than a circle/triangle/line is hand-drawn as "art." Where real
imagery belongs (satellite tiles, mountain photos) we use **labeled striped
placeholders**, never a fake.

---

## 9. Components

Core reusable components (see `app/shared.jsx`, `app/hero.jsx`):

- **Header / Brand** — wordmark + nav + primary CTA. Sticky, translucent, blurred.
- **ProjectCard** — dashboard glance unit: region kicker, project name, condition
  tone chip, weather strip (icon + summit hi/lo + precip + wind), 3-stat row
  (freezing / max wind / snowpack %), danger chip, target dates.
- **Stat** — label (mono kicker) + value (serif) + unit + optional sub. The atomic
  number display.
- **DangerChip** — circular level number in danger color + label.
- **DangerColumn** — Upper/Middle/Lower rows, each a 5-segment meter + tag. Compact
  variant for "tomorrow."
- **AspectRose** — 8-sector × 3-ring (Low/Mid/High) avalanche aspect/elevation rose.
  Filled sectors = problem present; ring opacity encodes elevation band.
- **PrecipChip** — snow/rain/mixed/chance/dry with icon + color.
- **Segmented** — the primary control for mutually-exclusive choices (elevation band,
  zoom level, chart variable, model table). Pill with sliding active state.
- **PanelHead / SectionTitle** — kicker + serif heading, optional right-aligned
  action.
- **drill-link** — the standard affordance into the drill-down layer (bordered ghost
  button, accent text, grid/sliders icon).
- **ConfidenceStrip** — horizontal model-agreement summary with per-model target
  values and a "Compare all models →" link.

Buttons: `btn-primary` (accent fill), `btn-ghost` (surface + border), `btn-sm`.
Inputs: hairline border, accent focus ring (`0 0 0 3px var(--accent-soft)`).

---

## 10. Signature View — Freezing Level Cross-Section

The product's hero and most distinctive asset (`FreezingLevelHero` in
`app/hero.jsx`). It renders the mountain in cross-section with the freezing level as
the organizing line.

**Construction (SVG):**
- A stylized ridge profile (smooth bezier path) whose peak reaches the summit
  elevation on the shared Y (elevation) scale.
- A `clipPath` of the mountain silhouette splits it at the noon freezing level:
  **snow gradient above, rock gradient below** — the classic "snow line on the
  mountain."
- The freezing level is drawn as a dashed accent line with a translucent band showing
  the day's min–max range, plus a labeled tag (`FREEZING LEVEL · 5,815 ft`).
- Three band guides (Base / Mid / Summit) with **floating HTML label cards**
  positioned by elevation %, each showing band name, elevation, temperature,
  feels-like, and precip type (All snow / Mixed / Rain · melt).

**Side rail:** the noon freezing readout (large serif), a "freezing level through the
day" mini line (`DayStrip`), and a plain-English takeaway ("Line sits 8,596 ft below
the summit — precip falls as snow above it").

**Decision:** static, not scrubbed. Per art direction, the view is a beautiful,
fully-labeled snapshot that reads instantly, with the day's *range* encoded as a band
rather than requiring interaction. The DayStrip provides the temporal read without a
control.

---

## 11. Daily Outlook — Progressive Granularity

The lead glance on the detail page (`DailyOutlook` in `app/detail.jsx`), modeled on
how climbers actually scan Mountain-Forecast: see the run of stable days into the
summit window first, then zoom in.

**Three zoom levels** (a Segmented control):

1. **Daily** — 7 day tiles (weekday, date, weather icon, high/low, wind+gust,
   precip). Full-width, fluid.
2. **AM·Mid·PM** — each day splits into Morning (6–12) / Midday (12–18) / Night
   (18–24). Day-group headers span their three columns; horizontal scroll.
3. **Hourly** — hour-by-hour tiles for the **next 48 hours only** — the window where
   the HRRR 3 km model is skillful. Single-temperature line, grouped by day, labeled
   *"Inside the 48-h window · HRRR 3 km."*

**Shared treatment across levels:**
- A **temperature trend ribbon** sits above the tiles (solid high line, dashed low
  line, faint area fill), densifying as you zoom. Its viewBox uses 100 units/column so
  data points align exactly over tile centers at every density and scroll position.
- The **target window** is highlighted (shaded band + "Target" flag) at every level.
- An elevation Base/Mid/Summit selector drives all levels.

**Why 48 h for hourly:** hourly resolution across a 7-day window would imply precision
the models don't have. Scoping hourly to the HRRR window is the honest expression of
principle #2.

---

## 12. Charts & Data Visualization

All charts are hand-built SVG (`app/charts.jsx`) — no charting library — for total
control over the editorial aesthetic and theme-awareness via CSS variables.

- **AreaSpark** — compact filled trend (SNOTEL 30-day snow depth).
- **LineChart** — multi-series with axes, optional target-band highlight, dashed/faded
  series, smoothed bezier paths. Used for the Model Lab comparisons and forecast
  evolution.
- **BarChart** — precipitation series.

**Model color encoding (consistent everywhere):**

| Model | Color | Resolution |
|---|---|---|
| HRRR | `--accent` (glacier blue) | 3 km · 0–48 h |
| GFS | `--caution` (amber) | 25 km · 16 d |
| ECMWF | `--good` (green) | 9 km · 15 d |

Convergence of lines ⇒ confidence; divergence ⇒ uncertainty, flagged inline
(`Δ16°F at target`). The **Model Lab hourly grid** is an aviation/MOS-style table:
monospace, right-aligned, target row shaded, cold cells blue / hot cells red.

---

## 13. Screens

**Dashboard (`/`)** — editorial header ("Your projects") + last-updated stamp, then a
responsive grid of ProjectCards and a dashed "Pin a peak" add-card. Each card is a
self-contained verdict.

**Pin a Peak (`/projects/new`)** — single-column form: typeahead peak search (with a
selected-state card), auto-filled project name, target window (date pickers, ≤14 days
out), notes. A reminder that new projects show a "pending first refresh" state.

**Project Detail (`/projects/[id]`)** — the calm layer; sticky sub-header with back,
title, dates, last-refreshed, **Share** (clipboard) and **Model lab** actions; then
the 7 sections in [§2](#2-information-architecture) order.

**Model Lab (`/projects/[id]/models`)** — the drill-down; its own monospace sub-header
with toggleable model chips, then 4 comparison charts, the forecast-evolution chart
(with a variable selector), and the hourly grid (with a model selector).

---

## 14. Interaction & Motion

This is a **hi-fi static prototype**: navigation, tabs, search, model toggles, and the
zoom levels are all live; there are no live time-scrubbers or real data fetches.

Motion is restrained and functional:
- Cards lift on hover (`translateY(-3px)` + shadow step).
- Buttons nudge up on hover.
- Segmented controls slide their active surface.
- No entrance animations, no decorative loops — calm is the point.

Route state persists to `localStorage` so a refresh keeps your place (a common move
during design review).

---

## 15. Responsive Behavior

Designed desktop-first, fully responsive (the user uses it at a desk *and* in the
field).

- **≤900px:** the hero collapses to a single column (figure over rail); 2- and 3-column
  detail grids stack; Model Lab charts go single-column.
- **≤680px:** reduced gutters, smaller page title, nav links hide (CTA remains),
  project grid is single-column, hero readout font shrinks, band label cards narrow.
- **Daily Outlook** AM/Mid/PM and Hourly levels scroll horizontally on all sizes; on
  mobile the daily level uses fixed 116px columns and scrolls too.

Hit targets stay ≥44px on touch. Tables and wide strips use horizontal scroll
containers rather than reflowing data into something dishonest.

---

## 16. Accessibility

- **Color is never the only signal.** Danger shows number + label + meter; condition
  tone shows dot + word; precip shows icon + text.
- Danger and tone palettes are chosen for adequate contrast against their tinted
  backgrounds; text meets ~AA against surfaces.
- Semantic controls: `role="tablist"`/`tab` on segmented controls, `aria-label` on
  icon-only buttons, real `<button>`/`<input>` elements.
- `prefers-reduced-motion` is respected (motion is minimal by default).
- Type floors: body ≥15px; data ≥10.5px (tabular, mono, high-legibility).

*Known gap:* a full keyboard-navigation and focus-visible audit is future work
(see §20).

---

## 17. Tweaks (Theme Controls)

An in-prototype Tweaks panel (toolbar-toggled) exposes curated, safe variations:

- **Mode** — Glacier / Slate.
- **Accent** — four cool-alpine swatches (glacier blue, teal, indigo, slate).
- **Headlines** — Newsreader (serif) vs Hanken Grotesk (sans) for a more modern feel.

Tweaks write CSS variables on the root, so changes are instant and total. The panel is
hidden unless the user enables Tweaks.

---

## 18. Code Architecture

A single HTML entry (`Cirque — Mountain Weather.html`) loads React 18 + Babel
standalone, then a set of small, single-purpose scripts. Files are kept small and
composed via globals (each module assigns its exports to `window`).

```
Cirque — Mountain Weather.html   entry: fonts, React/Babel, script order, #root
app/
  styles.css        all tokens, themes, component styles, responsive
  data.js           deterministic mock-data engine (plain IIFE → window.MWX)
  icons.jsx         line-icon set + WeatherIcon + WindArrow
  charts.jsx        AreaSpark / LineChart / BarChart (window.Charts)
  shared.jsx        Header, badges, danger, Stat, Segmented (window.UI)
  hero.jsx          FreezingLevelHero, DayStrip, AspectRose
  dashboard.jsx     Dashboard + ProjectCard + AddCard
  create.jsx        Pin a Peak flow
  detail.jsx        Project Detail + DailyOutlook + Confidence + panels
  modellab.jsx      Model Lab (charts, evolution, hourly grid)
  app.jsx           router + theme tweaks + mount
tweaks-panel.jsx    Tweaks shell + controls (host protocol)
```

**Conventions:** components live in `text/babel` scripts and export to `window` (Babel
gives each script its own scope). No `const styles = {}` collisions — style objects, if
any, are component-scoped or inline. Routing is a tiny in-memory state machine
(`{name, params}`) persisted to `localStorage`.

---

## 19. Mock Data Model

The prototype runs on a **deterministic procedural data engine** (`data.js`,
`window.MWX`) — no network. A seeded PRNG (`mulberry32`) makes every render stable.

**Scenario:** Winter, anchored Thursday **Feb 12 2026 14:00 PST**. Target weekend
**Feb 14–15**. A cold, mostly-clear "go" window Saturday, with a warm front arriving
Sunday → mid-next-week. Three peers exercise the full tone range:

| Peak | Regime | Tone |
|---|---|---|
| Mount Rainier | cold clear → incoming front | Marginal (cold + Considerable danger) |
| Mount Baker | stable high pressure | Favorable |
| Mount Shuksan | active / incoming storm | Hazardous |

**Generated per mountain:** hourly forecasts for HRRR (0–48 h), GFS, and ECMWF (each
with slight, characteristic bias/spread), across three elevation bands; daily/period
aggregates; 9 daily forecast snapshots converging on the target (the evolution
feature); NWAC zone forecast (danger by band, problems, aspect roses, narratives);
SNOTEL depth/SWE/% median + 30-day trend; a satellite scene stub.

**Derived UI signals:** temperature uses a ~3.5 °F/1000 ft lapse anchored at the
freezing level; precip type per band is snow/mixed/rain by position relative to the
freezing line; condition **tone** is a weighted score over wind, gusts, precip,
avalanche danger, and cold, bucketed to good/caution/alert.

**Important:** all timestamps are stored as **local** stamps (`YYYY-MM-DDTHH:00`) so
date-keying and `getHours()` agree regardless of runtime timezone (an early UTC-vs-PST
bug otherwise leaked hours across day boundaries).

---

## 20. Open Questions & Future Work

Design-side items the full product should resolve:

- **Day/night weather icons.** Hourly clear-sky currently shows a sun at night; add a
  moon variant keyed to local hour and sun/civil-twilight times.
- **"Now" marker** on the hourly outlook and Model Lab time axes.
- **Empty / pending states.** Design the "pending first refresh" card, the
  fewer-than-3-snapshots evolution state, and the summer NWAC "off-season" panel
  (avalanche forecasts pause ~May–Nov).
- **Real satellite imagery.** Replace the placeholder with Sentinel-2 RGB tiles and a
  snowline read; design the stale-imagery (>14 days) state.
- **Keyboard & focus audit.** Full focus-visible styling, tab order, and roving focus
  in segmented controls and the typeahead.
- **Field/mobile-first layout.** A dedicated compact layout for on-mountain use
  (larger touch targets, glove-friendly, high-contrast Slate by default).
- **Units & locale.** °F/°C, mph/kph/kt, ft/m toggles.
- **Comparison surface.** When exploring more peaks, a side-by-side compare view.

---

*Cirque is a proof-of-concept prototype. Data is simulated; this document describes
the design system as built, not a production specification.*
