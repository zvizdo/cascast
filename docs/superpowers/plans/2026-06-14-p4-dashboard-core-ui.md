# P4 — Dashboard, Create & Calm-Layer Detail UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Invoke the project `design-tokens` skill (and `nextjs-patterns` for any Server/Client boundary question) before writing UI; **where the skill conflicts with Cirque, Cirque wins** (contract §0). Run the `ux-reviewer` agent at the verification gate (Task 15).

**Goal:** Recreate the user-approved **Cirque** prototype's *calm layer* in Next.js 16 / React 19 / TS / Tailwind, wired to the real Route Handlers (P3) and types (`lib/types.ts`). Deliver: design tokens + themes + fonts; a units store (`lib/units.ts`) applied across every measured quantity; the Header (theme + units toggles); shared primitives; the icon set; hand-built SVG chart primitives; the Dashboard (`/`); the Pin-a-Peak create flow (`/projects/new`); the Project Detail calm-layer shell (`/projects/[id]`) in contract §0 IA order — Verdict, **Daily Outlook** (Daily → AM·Mid·PM → Hourly-48h), Avalanche (+ DangerColumn + AspectRose), Snowpack, Satellite + Notes — with **clearly-marked placeholders** for FreezingLevelHero + ConfidenceStrip (P5); and the `/mountains` browse + `/mountains/[slug]` pages (calm panels minus Confidence/Evolution/Model Lab). Pixel-faithful to Cirque, fully responsive, ≥90/90/85 Vitest coverage, Playwright green (desktop 1280×800 + mobile iPhone 12) with screenshots compared against the Cirque screens.

**Architecture:** Next.js 16 App Router. **Server Components by default**; mark a component `"use client"` only when it has state, effects, event handlers, the SWR hooks, the Zustand units store, Mapbox, or `localStorage`. Pages (`app/**/page.tsx`) are thin Server Components that render a client "view" component which does the SWR fetching against the P3 Route Handlers (contract §7). Display components are presentational and take typed props (no fetching); they convert every measured value through `lib/units.ts` helpers before rendering. Charts are hand-built SVG (no Recharts), theme-aware via CSS variables, and read the active units for axis ticks/labels. Themes switch via `[data-theme]` on `<html>`; tokens are CSS variables ported verbatim from the prototype `styles.css`. The prototype's `window`-globals structure is NOT copied — only the visual output and logic are recreated.

**Tech Stack:** Next.js 16.2.x, React 19.2, TypeScript (strict), Tailwind 3.4 (token bridge in `tailwind.config.ts`; most styling is the ported CSS in `globals.css` with semantic class names matching the prototype), SWR 2.2, Zustand 5 (persisted store), `d3` 7 (scale/path helpers only — charts are hand-drawn SVG), Mapbox GL JS 3, `next/font/google` (Newsreader, Hanken Grotesk, IBM Plex Mono), Vitest 2 + @testing-library/react 16 + jest-dom, Playwright 1.49 (desktop + mobile projects from P0 `playwright.config.ts`).

**Next.js 16 conventions** (apply everywhere): dynamic `params` is a **Promise** — pages do `export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; … }`. GET Route Handlers (P3) are already uncached-by-default and set `Cache-Control` themselves; the UI fetches them with SWR. `serverExternalPackages` is top-level (set in P0). Do not call Firestore/GCS from client components — always go through `/api/*`.

**References:** `docs/superpowers/specs/2026-06-14-mountain-weather-poc-design.md` (spec) and `docs/superpowers/specs/2026-06-14-interface-contract.md` (contract). The **binding visual spec** is the Cirque prototype at `prototype-ui/prototype-design-review/project/` — `DESIGN.md`, `app/styles.css`, and `app/{charts,shared,icons,dashboard,create,detail,data}.jsx`. Section numbers below (e.g. "contract §7") refer to the contract; "DESIGN §11" refers to the prototype DESIGN.md. P3 plan (`docs/superpowers/plans/2026-06-14-p3-api-layer.md`) provides `lib/types.ts`, `lib/format.ts`, and all Route Handlers consumed here.

**Prerequisites:**
- P0 complete: toolchain, `app/layout.tsx`/`app/page.tsx` shells, `app/globals.css` (Tailwind directives), `vitest.config.ts` (jsdom, coverage thresholds 90/90/85, includes `components/**` + `lib/**` + `app/api/**`), `playwright.config.ts` (desktop 1280×800 + mobile iPhone 12), emulator + `scripts/seed-emulator.ts`.
- P1/P2 complete: workers write `currentSummary` (incl. `tone`/`verdict`), `currentAvalancheSummary`, `currentSnowpackSummary`, combined blobs, NWAC/SNOTEL/satellite docs.
- P3 complete: `lib/types.ts` (contract §9), `lib/format.ts`, and every Route Handler in contract §7. **If P3 is not merged, this plan still compiles** against the §9 types; fetches resolve once P3 is present. Seed the emulator (`npm run seed:emulator`) with a sample project + sample blobs so Playwright has data.
- `NEXT_PUBLIC_MAPBOX_TOKEN` set in `.env.local` (placeholder acceptable; MountainMap renders a labeled fallback when absent — see Task 8).

**Exit criteria:**
- `npm run build` compiles clean (no TS/ESLint errors).
- `npm run test:coverage` passes with **lines ≥90, functions ≥90, branches ≥85** over `components/**` + `lib/units.ts` (+ the page view components).
- `npm run test:e2e` green on **both** Playwright projects (desktop + mobile); screenshots for Dashboard (populated + empty), Create, Detail (Daily/Period/Hourly outlook levels), Avalanche, Snowpack, Satellite+Notes, and `/mountains` + `/mountains/[slug]` saved under `test-results/` and visually compared to the Cirque screens.
- Theme toggle flips `[data-theme]` between `glacier`/`slate` and re-skins everything (tokens only, no literals).
- Units toggle (°F⇄°C, mph⇄km/h, ft⇄m) changes every measured display + chart axis live, persists to `localStorage` (`cirque.units`).
- Every CSS variable, both themes, and the responsive rules (≤900 / ≤680) match `prototype-ui/.../app/styles.css`.
- Accessibility: danger = number + label + meter; tone = dot + word; precip = icon + text; segmented controls are `role="tablist"`/`tab`; units toggle is a labeled `role="group"`; icon-only buttons have `aria-label`.
- `ux-reviewer` agent run with no blocking findings.

---

## File structure created in P4

| Path | Responsibility |
|---|---|
| `app/globals.css` | All Cirque tokens + Glacier/Slate themes + component classes + responsive (ported from `styles.css`) |
| `tailwind.config.ts` | Theme extension bridging CSS vars (colors, fonts, radius) |
| `app/layout.tsx` | `next/font/google` (Newsreader/Hanken Grotesk/IBM Plex Mono), `[data-theme]` root, Header |
| `lib/units.ts` (+ `lib/__tests__/units.test.ts`) | Zustand `useUnits` (persisted) + `convTemp/convWind/convDist` + `fmtTemp/fmtWind/fmtDist` |
| `components/layout/{Header,ThemeToggle,UnitsToggle,PageWrapper}.tsx` (+ tests) | App bar, toggles |
| `components/shared/{Stat,Segmented,DangerChip,PrecipChip,PanelHead,SectionTitle,DrillLink,ConditionTone,LastUpdated,CopyLinkButton}.tsx` (+ tests) | Primitives |
| `components/icons/{icons,WeatherIcon,WindArrow}.tsx` (+ tests) | Line-icon set + WMO mapper + rotatable arrow |
| `components/charts/{AreaSpark,LineChart,BarChart}.tsx` (+ tests) | Hand-built SVG charts |
| `components/dashboard/{Dashboard,ProjectCard,AddCard,EmptyState}.tsx` (+ tests) | Dashboard view |
| `app/page.tsx` | Dashboard route (renders `<Dashboard/>`) |
| `components/create/{PinAPeak,MountainSearch,MountainMap,DateRangePicker}.tsx` (+ tests) | Create flow |
| `app/projects/new/page.tsx` | Create route |
| `components/project/{ProjectHeader,Verdict,DailyOutlook,AvalanchePanel,DangerColumn,AspectRose,SnowpackPanel,SatellitePanel,NotesPanel}.tsx` (+ tests) | Calm-layer panels |
| `app/projects/[id]/page.tsx` + `components/project/ProjectDetail.tsx` | Detail shell (async params) |
| `components/mountains/{Mountains,MountainCard}.tsx` (+ tests) | Browse list + card |
| `app/mountains/page.tsx`, `app/mountains/[slug]/page.tsx` + `components/mountains/MountainDetail.tsx` | Browse routes |
| `lib/hooks.ts` (+ tests) | SWR fetcher + typed hooks (`useProjects`, `useProject`, `useWeather`, `useNwac`, `useSnotel`, `useMountains`, `useMountain`) |
| `lib/derive.ts` (+ tests) | Port of prototype derived signals (daily/period/hourly aggregation, precip-type, tone label) operating on `CombinedForecastBlob` |
| `tests/e2e/{dashboard,create,detail,mountains}.spec.ts` | Playwright specs (desktop + mobile) |

**CSS approach:** the prototype is plain CSS classes (`.proj-card`, `.daily`, `.stat`, …). Recreate it by **porting `styles.css` verbatim into `app/globals.css`** (after the `@tailwind` directives) and giving each component the **same class names** the prototype uses. Tailwind utilities are used only for one-off layout not covered by a ported class. This is the fastest path to pixel-fidelity and the contract's explicit instruction ("Port the exact token values… recreate pixel-perfect").

---

## Task 1: Design tokens, themes & fonts (`globals.css`, `tailwind.config.ts`, `layout.tsx`)

**Files:**
- Modify: `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`
- Create: `app/__tests__/tokens.test.ts`

**Data consumed:** none (foundation).

**Acceptance criteria (visual + behavioral):**
- `app/globals.css` contains, after the three `@tailwind` directives, the **complete** token block from `prototype-ui/.../app/styles.css` lines 1–432: the `:root` Glacier tokens (lines 3–49), the `[data-theme="slate"]` overrides (51–82), base resets + `.mono`/`.kicker`/`.mono-dim` (84–104), and **every** component class (appbar, btn, page, section, tone+badges, stat, segmented, card/panel, dashboard, empty, detail, hero, panel-head, week-row, daily outlook, conf-strip, avalanche, snotel+satellite, note-card, create flow, model-lab classes, and the two `@media` blocks at 413–432). Token **values** must be byte-identical (e.g. `--accent: #2c6d8f;`, `--target-band: rgba(44,109,143,.09)` → `0.09`, radius `14px`/`9px`, the three shadows).
- `app/layout.tsx` loads the three families via `next/font/google` and exposes them as CSS variables, **overriding** the prototype's quoted-name fallbacks: bind `--sans`→Hanken Grotesk, `--serif`→Newsreader, `--mono`→IBM Plex Mono on `<html>` (or `<body>`). Newsreader weights 400/500/600 + italic; Hanken Grotesk 400/500/600/700; IBM Plex Mono 400/500/600.
- `<html lang="en" data-theme="glacier">` is the default; `ThemeToggle` (Task 3) toggles to `slate`.
- `tailwind.config.ts` `theme.extend` bridges the CSS vars so Tailwind utilities can reference them: `colors: { bg:'var(--bg)', surface:'var(--surface)', ink:'var(--ink)', muted:'var(--muted)', line:'var(--line)', accent:'var(--accent)', good:'var(--good)', caution:'var(--caution)', alert:'var(--alert)', d1..d5 }`, `fontFamily:{ sans:['var(--font-sans)'], serif:['var(--font-serif)'], mono:['var(--font-mono)'] }`, `borderRadius:{ DEFAULT:'14px', sm:'9px' }`. (Components mainly use the ported classes; this bridge is for the few Tailwind utilities used.)

**Vitest test specs** (`app/__tests__/tokens.test.ts`) — assert the ported CSS exists and is correct by reading the file:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../globals.css", import.meta.url)), "utf8");

describe("globals.css — ported Cirque tokens", () => {
  it("defines Glacier accent + background", () => {
    expect(css).toMatch(/--accent:\s*#2c6d8f/);
    expect(css).toMatch(/--bg:\s*#e9eef3/);
  });
  it("defines all five NAC danger colors", () => {
    for (const [k, v] of [["--d1", "#4e9c52"], ["--d2", "#ecc531"], ["--d3", "#ef8a26"], ["--d4", "#df3a2f"], ["--d5", "#1d1d1d"]]) {
      expect(css).toContain(`${k}: ${v}`);
    }
  });
  it("defines the three condition tones", () => {
    expect(css).toMatch(/--good:\s*#3f8f6b/);
    expect(css).toMatch(/--caution:\s*#c98a2e/);
    expect(css).toMatch(/--alert:\s*#c5503f/);
  });
  it("provides a Slate theme override of accent + bg", () => {
    expect(css).toMatch(/\[data-theme="slate"\][\s\S]*--accent:\s*#5cabd8/);
    expect(css).toMatch(/\[data-theme="slate"\][\s\S]*--bg:\s*#0d141d/);
  });
  it("ports the responsive breakpoints", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 680px)");
  });
  it("ports the radius tokens", () => {
    expect(css).toMatch(/--radius:\s*14px/);
    expect(css).toMatch(/--radius-sm:\s*9px/);
  });
});
```

**Playwright spec:** covered by Task 7+ screenshots (theme/units verified in Task 3). No standalone screenshot here.

- [ ] **Step 1: Write `app/__tests__/tokens.test.ts`** (above). Run `npm test -- app/__tests__/tokens.test.ts` → **FAIL** (tokens absent).
- [ ] **Step 2: Port `styles.css` into `app/globals.css`** — keep the `@tailwind` lines from P0, then paste the full prototype CSS (lines 1–432) below them, byte-for-byte token values.
- [ ] **Step 3: Add fonts + `[data-theme]` in `app/layout.tsx`** via `next/font/google`, binding `--font-sans/serif/mono` and re-pointing `--sans/--serif/--mono` to them; set `<html lang="en" data-theme="glacier">`; render `<Header/>` (Task 3) above `{children}`.
- [ ] **Step 4: Extend `tailwind.config.ts`** with the color/font/radius bridge.
- [ ] **Step 5:** Run `npm test -- app/__tests__/tokens.test.ts` → **PASS** (6 tests). Run `npm run build` → compiles.
- [ ] **Step 6: Commit** — `git add app/globals.css app/layout.tsx tailwind.config.ts app/__tests__/tokens.test.ts && git commit -m "feat(p4): port Cirque tokens, themes, and fonts"`

---

## Task 2: `lib/units.ts` — units store + conversion/format helpers (FULL TDD)

**Files:**
- Create: `lib/units.ts`, `lib/__tests__/units.test.ts`

**Data consumed:** none — this is the foundation every display component routes measured values through (contract §12a). Canonical storage is °F, mph, ft.

**Props/API surface:**
```ts
export type TempUnit = "F" | "C";
export type WindUnit = "mph" | "kmh";
export type DistUnit = "ft" | "m";
export interface UnitPrefs { temp: TempUnit; wind: WindUnit; dist: DistUnit }

export const DEFAULT_UNITS: UnitPrefs; // { temp: "F", wind: "mph", dist: "ft" }

// Zustand store, persisted to localStorage key "cirque.units"
export const useUnits: UseBoundStore<...>; // state: UnitPrefs + setTemp/setWind/setDist/set(partial)

// pure converters (canonical → target unit, numeric)
export function convTemp(f: number, to: TempUnit): number;     // F → F|C
export function convWind(mph: number, to: WindUnit): number;   // mph → mph|kmh
export function convDist(ft: number, to: DistUnit): number;    // ft → ft|m
// formatters (canonical value + target unit → display string incl. symbol)
export function fmtTemp(f: number | null | undefined, to: TempUnit, opts?: { withUnit?: boolean }): string; // "23°F"
export function fmtWind(mph: number | null | undefined, to: WindUnit): string;  // "45 mph"
export function fmtDist(ft: number | null | undefined, to: DistUnit, opts?: { k?: boolean }): string; // "5,815 ft" | "1.8 km" (k → thousands form)
```

**Conversion + rounding rules (assert exactly):**
- `convTemp`: C = `(f - 32) * 5/9`; rounded to nearest integer for display. `convTemp(32,"C")===0`, `convTemp(212,"C")===100`, `convTemp(23,"C")===-5` (round of -5.0), `convTemp(50,"F")===50`.
- `convWind`: kmh = `mph * 1.609344`; display rounded to integer. `convWind(10,"kmh")===16` (16.09…→16), `convWind(60,"kmh")===97`, `convWind(10,"mph")===10`.
- `convDist`: m = `ft * 0.3048`; display rounded to integer. `convDist(1000,"m")===305` (304.8→305), `convDist(5815,"m")===1773`, `convDist(5420,"ft")===5420`.
- Formatters: `fmtTemp(23,"F")==="23°F"`, `fmtTemp(23,"C")==="-5°C"`, `fmtTemp(null,"F")==="—"`; `fmtWind(45,"mph")==="45 mph"`, `fmtWind(45,"kmh")==="72 km/h"`; `fmtDist(5815,"ft")==="5,815 ft"` (thousands separator via `toLocaleString`), `fmtDist(5815,"m")==="1,773 m"`, `fmtDist(5420,"ft",{k:true})==="5.4k ft"`, `fmtDist(1773*?,…)` — for the `{k:true}` form value/1000 with one decimal, unit `"k ft"`/`"k m"`. `withUnit:false` omits the symbol (returns just the number string).
- Null/undefined → `"—"` (em dash) for all formatters.

**Vitest test specs** (`lib/__tests__/units.test.ts`):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_UNITS, useUnits, convTemp, convWind, convDist, fmtTemp, fmtWind, fmtDist,
} from "@/lib/units";

describe("convTemp", () => {
  it("identity for F", () => expect(convTemp(50, "F")).toBe(50));
  it("freezing/boiling", () => { expect(convTemp(32, "C")).toBe(0); expect(convTemp(212, "C")).toBe(100); });
  it("rounds negatives", () => expect(convTemp(23, "C")).toBe(-5));
});
describe("convWind", () => {
  it("identity for mph", () => expect(convWind(10, "mph")).toBe(10));
  it("mph → km/h rounded", () => { expect(convWind(10, "kmh")).toBe(16); expect(convWind(60, "kmh")).toBe(97); });
});
describe("convDist", () => {
  it("identity for ft", () => expect(convDist(5420, "ft")).toBe(5420));
  it("ft → m rounded", () => { expect(convDist(1000, "m")).toBe(305); expect(convDist(5815, "m")).toBe(1773); });
});
describe("formatters", () => {
  it("fmtTemp adds symbol + converts", () => { expect(fmtTemp(23, "F")).toBe("23°F"); expect(fmtTemp(23, "C")).toBe("-5°C"); });
  it("fmtWind adds unit", () => { expect(fmtWind(45, "mph")).toBe("45 mph"); expect(fmtWind(45, "kmh")).toBe("72 km/h"); });
  it("fmtDist groups thousands + converts", () => {
    expect(fmtDist(5815, "ft")).toBe("5,815 ft");
    expect(fmtDist(5815, "m")).toBe("1,773 m");
  });
  it("fmtDist k-form", () => { expect(fmtDist(5420, "ft", { k: true })).toBe("5.4k ft"); });
  it("withUnit:false drops the symbol", () => expect(fmtTemp(23, "F", { withUnit: false })).toBe("23"));
  it("null → em dash", () => { expect(fmtTemp(null, "F")).toBe("—"); expect(fmtWind(undefined, "mph")).toBe("—"); expect(fmtDist(null, "ft")).toBe("—"); });
});
describe("useUnits store", () => {
  beforeEach(() => { localStorage.clear(); useUnits.setState(DEFAULT_UNITS); });
  it("defaults to imperial", () => {
    const s = useUnits.getState();
    expect({ temp: s.temp, wind: s.wind, dist: s.dist }).toEqual({ temp: "F", wind: "mph", dist: "ft" });
  });
  it("setTemp updates and persists", () => {
    useUnits.getState().setTemp("C");
    expect(useUnits.getState().temp).toBe("C");
    expect(localStorage.getItem("cirque.units")).toContain("\"temp\":\"C\"");
  });
  it("each axis is independent", () => {
    useUnits.getState().setWind("kmh");
    const s = useUnits.getState();
    expect(s.wind).toBe("kmh"); expect(s.temp).toBe("F"); expect(s.dist).toBe("ft");
  });
});
```

- [ ] **Step 1: Write `lib/__tests__/units.test.ts`** (above). Run `npm test -- lib/__tests__/units.test.ts` → **FAIL** (module missing).
- [ ] **Step 2: Implement `lib/units.ts`** — pure converters + formatters, then the Zustand store with `persist` (storage `localStorage`, key `"cirque.units"`). `"use client"` is NOT required for the pure functions; the store is importable from both server (state-only) and client.
- [ ] **Step 3:** Run `npm test -- lib/__tests__/units.test.ts` → **PASS** (all cases). Confirm branch coverage of the null/`{k:true}`/`withUnit:false` paths.
- [ ] **Step 4: Commit** — `git commit -m "feat(p4): units store + conversion/format helpers (TDD)"`

---

## Task 3: Header + ThemeToggle + UnitsToggle (`components/layout/`)

**Files:**
- Create: `components/layout/Header.tsx`, `components/layout/ThemeToggle.tsx`, `components/layout/UnitsToggle.tsx`, `components/layout/PageWrapper.tsx`, and `components/layout/__tests__/{Header,ThemeToggle,UnitsToggle}.test.tsx`

**Data consumed:** `useUnits` (Task 2); theme via `document.documentElement.dataset.theme` (persist to `localStorage` key `cirque.theme`).

**Props interfaces:**
```ts
// Header.tsx — "use client" (contains the toggles + active-nav state)
interface HeaderProps { /* none — reads pathname via usePathname() */ }
// ThemeToggle.tsx — "use client"
interface ThemeToggleProps { className?: string }
// UnitsToggle.tsx — "use client"
interface UnitsToggleProps { className?: string }
// PageWrapper.tsx — server component
interface PageWrapperProps { children: React.ReactNode; className?: string } // renders <div className="page ...">
```

**Acceptance criteria** (ref `app/shared.jsx` `Header`/`Brand` + `styles.css` `.appbar`/`.nav`/`.btn`):
- `.appbar` sticky, translucent (`color-mix(in srgb, var(--surface) 88%, transparent)`), `backdrop-filter: blur(14px)`, bottom hairline — these come from the ported CSS; Header just uses the classes.
- Left: `Brand` = mountain icon (accent) + serif wordmark "Cirque", a `<button aria-label="Cirque home">` linking to `/` (use `next/link` styled as `.brand`).
- Nav (`.nav`): "Projects" → `/`, "Peaks" → `/mountains`; active link gets `.is-active` based on `usePathname()`. Nav hides at ≤680px (ported CSS).
- Right: `UnitsToggle`, `ThemeToggle`, then the primary CTA `.btn .btn-primary` "Pin a Peak" (pin icon) → `/projects/new`.
- **ThemeToggle:** an icon button (`aria-label="Toggle theme"`, `aria-pressed` reflects slate) that flips `document.documentElement.dataset.theme` between `"glacier"`/`"slate"` and persists to `localStorage`; on mount it reads the stored value. Shows sun glyph in slate / moon-ish (use `Icons.eye`/`sun` line glyph) — icon only, line style.
- **UnitsToggle:** a compact 3-axis control, `role="group" aria-label="Display units"`. Three mini `Segmented` triplets/pairs (Temp °F|°C, Wind mph|km/h, Dist ft|m) using the `.segmented`/`.seg` classes, wired to `useUnits` setters. Each pair labeled for a11y (`aria-label` per axis). On mobile (≤680) it may collapse to a single popover button, but for the POC render inline-compact; ensure ≥44px hit targets.

**Vitest test specs** (key cases):
```tsx
// ThemeToggle.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
beforeEach(() => { document.documentElement.dataset.theme = "glacier"; localStorage.clear(); });
it("toggles [data-theme] and persists", () => {
  render(<ThemeToggle />);
  const btn = screen.getByRole("button", { name: /toggle theme/i });
  fireEvent.click(btn);
  expect(document.documentElement.dataset.theme).toBe("slate");
  expect(localStorage.getItem("cirque.theme")).toBe("slate");
  fireEvent.click(btn);
  expect(document.documentElement.dataset.theme).toBe("glacier");
});

// UnitsToggle.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { UnitsToggle } from "@/components/layout/UnitsToggle";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
beforeEach(() => { useUnits.setState(DEFAULT_UNITS); });
it("is a labeled group with three axes", () => {
  render(<UnitsToggle />);
  expect(screen.getByRole("group", { name: /display units/i })).toBeInTheDocument();
});
it("switching temp updates the store", () => {
  render(<UnitsToggle />);
  fireEvent.click(screen.getByRole("tab", { name: /°C/ }));
  expect(useUnits.getState().temp).toBe("C");
});

// Header.test.tsx (wrap in a router mock; mock next/navigation usePathname → "/")
it("renders brand, nav, and the Pin a Peak CTA", () => {
  render(<Header />);
  expect(screen.getByRole("button", { name: /cirque home/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /projects/i })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: /pin a peak/i })).toHaveAttribute("href", "/projects/new");
});
```
> Mock `next/navigation`'s `usePathname`/`useRouter` in `vitest.setup.ts` or per-file (`vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }))`).

**Playwright spec** (folded into Task 7 dashboard spec — header is on every page): assert theme toggle flips `<html data-theme>` and the units toggle changes a visible stat (e.g. a Freezing stat from `5,815 ft` → `1,773 m`); screenshot the header in both themes.

- [ ] Step 1: Write the three test files → run → **FAIL**.
- [ ] Step 2: Implement `ThemeToggle`, `UnitsToggle`, `PageWrapper`, then `Header` (uses Brand + nav + both toggles + CTA). Reuse the shared `Segmented` (Task 4) once it exists, or inline the `.segmented`/`.seg` markup if building Header first — prefer building Task 4 first; if not, inline and refactor.
- [ ] Step 3: Run the three tests → **PASS**.
- [ ] Step 4: Commit — `git commit -m "feat(p4): Header with theme + units toggles"`

---

## Task 4: Shared primitives (`components/shared/`)

**Files:** Create one component + test file per primitive under `components/shared/` and `components/shared/__tests__/`. All are **presentational**; measured values arrive already-formatted OR the component reads `useUnits` and formats internally (specified per component below). Source of truth: `app/shared.jsx` + the matching `styles.css` classes.

**Props interfaces:**
```ts
// Stat.tsx (server-ok; pure presentational — caller pre-formats value/unit)
interface StatProps { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; accent?: string }
// Segmented.tsx ("use client")
interface SegOption<T extends string> { value: T; label: string }
interface SegmentedProps<T extends string> { options: SegOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel?: string }
// DangerChip.tsx (server-ok)
interface DangerChipProps { level: number; tomorrow?: boolean }   // level 1–5; -1/0 → "No rating" neutral chip
// PrecipChip.tsx (server-ok)
interface PrecipChipProps { type: "snow" | "rain" | "mixed" | "chance" | "none" }
// PanelHead.tsx (server-ok)
interface PanelHeadProps { kicker: string; title: string; right?: React.ReactNode }
// SectionTitle.tsx (server-ok)
interface SectionTitleProps { kicker?: string; title: string; action?: React.ReactNode }
// DrillLink.tsx (server-ok; renders <Link> or <button>)
interface DrillLinkProps { href?: string; onClick?: () => void; icon?: React.ReactNode; children: React.ReactNode }
// ConditionTone.tsx (server-ok)
interface ConditionToneProps { tone: "good" | "caution" | "alert"; chip?: boolean } // dot + word; chip → pill style (.pc-tone)
// LastUpdated.tsx ("use client" — uses lib/format relative time)
interface LastUpdatedProps { iso: string | null; prefix?: string }  // "Updated Sat, 2:00 PM" | "Pending first refresh" when null
// CopyLinkButton.tsx ("use client")
interface CopyLinkButtonProps { url?: string }  // defaults to window.location.href; shows "Copied" check for 1.6s
```

**Constants to port:**
```ts
export const DANGER: Record<number, { label: string; varName: string }> = {
  1: { label: "Low", varName: "--d1" }, 2: { label: "Moderate", varName: "--d2" },
  3: { label: "Considerable", varName: "--d3" }, 4: { label: "High", varName: "--d4" },
  5: { label: "Extreme", varName: "--d5" },
};
export const TONE_LABEL = { good: "Favorable", caution: "Marginal", alert: "Hazardous" } as const;
```

**Acceptance criteria:**
- `Stat`: `.stat` > `.stat-label` (mono kicker) + `.stat-value` (serif) with `.stat-unit` + optional `.stat-sub`; `accent` colors the value.
- `Segmented`: `.segmented[role=tablist]` with `.seg[role=tab][aria-selected]`; active gets `.is-active` (sliding surface via CSS). Keyboard: clickable buttons (arrow-key roving is P6 — not required here, but `role` correctness is).
- `DangerChip`: `.danger-chip` with `--c` set to the level color, `.danger-num` circle + `.danger-lbl` ("Considerable", "→" suffix when `tomorrow`). For `level <= 0` render a neutral "No rating" chip (grey, no colored number) — handles summer/no-rating from NWAC (contract §5.2).
- `PrecipChip`: `.precip-chip` with icon (flake/drop/cloud/sun) + word in the mapped color (snow→accent, rain/mixed→`--d3`, chance/none→muted), per `app/shared.jsx` map.
- `ConditionTone`: dot (`.tone-dot.tone-<tone>`) + word (`TONE_LABEL`); `chip` variant uses `.pc-tone.<tone>`. **Never color-only** (word always present).
- `DrillLink`: `.drill-link` ghost button/link with optional icon (grid/sliders).
- `LastUpdated`: formats `iso` via `lib/format` (P3) to the prototype style (`fmtRefreshed` → e.g. "Sat, 2:00 PM"); `null` → "Pending first refresh".
- `CopyLinkButton`: `.btn .btn-ghost .btn-sm`; copies `url ?? location.href` to clipboard, swaps label to "Copied" with a check for 1.6s (`app/detail.jsx` copy behavior).

**Vitest test specs** (representative — write one file per component; examples):
```tsx
// Stat.test.tsx
it("renders label, serif value, unit, sub", () => {
  render(<Stat label="Wind" value={45} unit="mph" sub="gust 60" />);
  expect(screen.getByText("Wind")).toHaveClass("stat-label");
  expect(screen.getByText("45")).toBeInTheDocument();
  expect(screen.getByText("mph")).toHaveClass("stat-unit");
  expect(screen.getByText("gust 60")).toHaveClass("stat-sub");
});
// Segmented.test.tsx
it("is a tablist; clicking a tab fires onChange", () => {
  const onChange = vi.fn();
  render(<Segmented ariaLabel="Zoom" value="day" onChange={onChange}
    options={[{ value: "day", label: "Daily" }, { value: "hour", label: "Hourly" }]} />);
  expect(screen.getByRole("tablist", { name: "Zoom" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Hourly" }));
  expect(onChange).toHaveBeenCalledWith("hour");
  expect(screen.getByRole("tab", { name: "Daily" })).toHaveAttribute("aria-selected", "true");
});
// DangerChip.test.tsx
it("shows number + label (not color-only)", () => {
  render(<DangerChip level={3} />);
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("Considerable")).toBeInTheDocument();
});
it("handles no-rating", () => { render(<DangerChip level={-1} />); expect(screen.getByText(/no rating/i)).toBeInTheDocument(); });
// ConditionTone.test.tsx
it("shows dot + word", () => {
  const { container } = render(<ConditionTone tone="caution" />);
  expect(container.querySelector(".tone-dot.tone-caution")).toBeTruthy();
  expect(screen.getByText("Marginal")).toBeInTheDocument();
});
// PrecipChip.test.tsx
it("shows icon + text for snow", () => { render(<PrecipChip type="snow" />); expect(screen.getByText("Snow")).toBeInTheDocument(); });
// CopyLinkButton.test.tsx (mock navigator.clipboard.writeText)
it("copies and shows Copied", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<CopyLinkButton url="https://x/y" />);
  fireEvent.click(screen.getByRole("button", { name: /share/i }));
  expect(writeText).toHaveBeenCalledWith("https://x/y");
  await screen.findByText(/copied/i);
});
// LastUpdated.test.tsx
it("renders pending when null", () => { render(<LastUpdated iso={null} />); expect(screen.getByText(/pending first refresh/i)).toBeInTheDocument(); });
```

- [ ] Step 1: Write all shared test files → run → **FAIL**.
- [ ] Step 2: Implement each primitive (start with `Segmented`, `Stat`, `ConditionTone`, `DangerChip`, `PrecipChip`, then `PanelHead`, `SectionTitle`, `DrillLink`, `LastUpdated`, `CopyLinkButton`).
- [ ] Step 3: Run the shared suite → **PASS**.
- [ ] Step 4: Commit — `git commit -m "feat(p4): shared UI primitives (Stat, Segmented, Danger/Precip chips, tone, drill-link, copy, last-updated)"`

---

## Task 5: Icons (`components/icons/`)

**Files:** Create `components/icons/icons.tsx`, `components/icons/WeatherIcon.tsx`, `components/icons/WindArrow.tsx`, `components/icons/__tests__/icons.test.tsx`. Port from `app/icons.jsx`.

**Props interfaces:**
```ts
interface IconProps extends React.SVGProps<SVGSVGElement> { size?: number; sw?: number } // sw = stroke-width, default 1.6
type IconComponent = (p: IconProps) => JSX.Element;
export const Icons: Record<
  "sun"|"partly"|"cloud"|"snow"|"rain"|"fog"|"wind"|"thermo"|"drop"|"flake"|"mountain"|"pin"|"layers"|
  "arrowRight"|"arrowLeft"|"chevron"|"clock"|"calendar"|"refresh"|"link"|"search"|"alert"|"satellite"|
  "sliders"|"grid"|"check"|"compass"|"eye", IconComponent>;
interface WeatherIconProps extends IconProps { code: number }   // WMO → sun/partly/cloud/rain/snow/fog
interface WindArrowProps { deg?: number; size?: number }        // rotate(deg); wind FROM direction
```

**Acceptance criteria:** every glyph from `app/icons.jsx` reproduced exactly (24×24, `fill=none`, `stroke=currentColor`, `strokeWidth=sw` default 1.6, round caps/joins). `WeatherIcon` mapping: `code>=71 → snow`, `>=51 → rain`, `45|48 → fog`, `3 → cloud`, `1|2 → partly`, else `sun`. `WindArrow` renders a filled arrow `<path d="M12 3l5 9h-3v9h-4v-9H7z" fill="currentColor">` inside a `rotate(${deg}deg)` transform.

**Vitest test specs:**
```tsx
import { render } from "@testing-library/react";
import { Icons } from "@/components/icons/icons";
import { WeatherIcon } from "@/components/icons/WeatherIcon";
import { WindArrow } from "@/components/icons/WindArrow";

it("renders an svg with currentColor stroke + default size", () => {
  const { container } = render(<Icons.mountain />);
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("stroke", "currentColor");
  expect(svg).toHaveAttribute("width", "24");
});
it("respects size + sw props", () => {
  const { container } = render(<Icons.wind size={11} sw={2} />);
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("width", "11");
  expect(svg).toHaveAttribute("stroke-width", "2");
});
it.each([[80,"snow"],[61,"rain"],[45,"fog"],[3,"cloud"],[2,"partly"],[0,"sun"]])(
  "maps WMO %i to a weather glyph", (code) => {
  const { container } = render(<WeatherIcon code={code} />);
  expect(container.querySelector("svg")).toBeTruthy();
});
it("rotates the wind arrow by deg", () => {
  const { container } = render(<WindArrow deg={90} />);
  expect(container.querySelector("svg")!.getAttribute("style")).toContain("rotate(90deg)");
});
```

- [ ] Step 1: Write `icons.test.tsx` → **FAIL**.
- [ ] Step 2: Implement `icons.tsx` (the `S` wrapper + the full `Icons` map), `WeatherIcon.tsx`, `WindArrow.tsx`.
- [ ] Step 3: Run → **PASS**.
- [ ] Step 4: Commit — `git commit -m "feat(p4): line icon set, WeatherIcon, WindArrow"`

---

## Task 6: Chart primitives (`components/charts/`)

**Files:** Create `components/charts/AreaSpark.tsx`, `components/charts/LineChart.tsx`, `components/charts/BarChart.tsx`, `components/charts/chart-utils.ts` (the `sx` scale + `linePath` bezier helper), and `components/charts/__tests__/charts.test.tsx`. Port from `app/charts.jsx`. Hand-built SVG, theme-aware via CSS vars; **no Recharts**.

**Props interfaces:**
```ts
// chart-utils.ts
export function sx(d0: number, d1: number, r0: number, r1: number): (v: number) => number;
export function linePath(pts: { x: number; y: number }[]): string; // smooth bezier (midpoint control points)

// AreaSpark.tsx
interface AreaSparkProps { data: { v: number }[]; w?: number; h?: number; color?: string; fill?: string; pad?: number }
// LineChart.tsx
interface Series { key: string; color: string; points: { x: number; y: number }[]; dashed?: boolean; faded?: boolean; width?: number }
interface LineChartProps {
  series: Series[]; w?: number; h?: number; xLabels?: { i: number; t: string }[];
  yUnit?: string; yMin?: number; yMax?: number; band?: { x0: number; x1: number } | null;
  yTicks?: number; font?: number; grid?: string; ink?: string;
}
// BarChart.tsx
interface BarDatum { v: number; color?: string; faded?: boolean }
interface BarChartProps { data: BarDatum[]; w?: number; h?: number; color?: string; unit?: string; xLabels?: { i: number; t: string }[]; band?: { x0: number; x1: number } | null }
```

**Acceptance criteria** (match `app/charts.jsx` exactly):
- `AreaSpark`: responsive `width="100%"` SVG, `viewBox 0 0 w h`, `preserveAspectRatio="none"`; padded Y domain (`±10%`); smooth `linePath`; area fill to baseline; end-point dot. Defaults `w=280,h=64,pad=4`.
- `LineChart`: y-domain nice-rounded to /5 unless `yMin/yMax` given; gridlines + mono tick labels (left, `textAnchor=end`); optional `band` rect (`var(--target-band)`); each series a smooth path with `vectorEffect="non-scaling-stroke"`, `dashed`→`4 4`, `faded`→opacity 0.35, end dot. x-labels along the bottom (mono).
- `BarChart`: baseline at 0, bars at `0.6` column width, per-datum color, mono x-labels, optional band + unit label.
- **Units awareness:** chart callers (DailyOutlook, SnowpackPanel, P5 ModelLab) convert series **values + axis ticks** through `lib/units.ts` BEFORE passing to the chart (charts stay unit-agnostic numeric renderers). The temperature ribbon in DailyOutlook (Task 10) is its own inline SVG (100-units/column) per the prototype, not `LineChart`.
- Theme-aware: colors are CSS-var strings (`var(--accent)` etc.); no hard-coded theme literals except the helper defaults.

**Vitest test specs:**
```tsx
import { render } from "@testing-library/react";
import { AreaSpark } from "@/components/charts/AreaSpark";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { sx, linePath } from "@/components/charts/chart-utils";

describe("chart-utils", () => {
  it("sx maps domain to range linearly", () => { const f = sx(0, 10, 0, 100); expect(f(5)).toBe(50); });
  it("linePath starts with a moveTo", () => { expect(linePath([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toMatch(/^M 0 0/); });
  it("linePath empty → empty string", () => expect(linePath([])).toBe(""));
});
it("AreaSpark draws area + line + end dot", () => {
  const { container } = render(<AreaSpark data={[{ v: 1 }, { v: 3 }, { v: 2 }]} />);
  expect(container.querySelectorAll("path").length).toBe(2);
  expect(container.querySelector("circle")).toBeTruthy();
});
it("LineChart draws gridlines, a band, and one path per series", () => {
  const { container } = render(<LineChart band={{ x0: 1, x1: 2 }}
    series={[{ key: "a", color: "var(--accent)", points: [{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 15 }] }]} />);
  expect(container.querySelector("rect")).toBeTruthy();              // band
  expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
  expect(container.querySelectorAll("text").length).toBeGreaterThan(0); // tick labels
});
it("BarChart renders a bar per positive datum", () => {
  const { container } = render(<BarChart data={[{ v: 0 }, { v: 0.4 }, { v: 0.2 }]} />);
  expect(container.querySelectorAll("rect").length).toBe(2);          // only v>0
});
```

**Playwright spec:** a render screenshot is captured indirectly via SnowpackPanel (Task 12) and DailyOutlook ribbon (Task 10). No standalone page.

- [ ] Step 1: Write `charts.test.tsx` → **FAIL**.
- [ ] Step 2: Implement `chart-utils.ts`, then `AreaSpark`, `LineChart`, `BarChart`.
- [ ] Step 3: Run → **PASS**.
- [ ] Step 4: Commit — `git commit -m "feat(p4): hand-built SVG chart primitives (AreaSpark/LineChart/BarChart)"`

---

## Task 7: Dashboard (`app/page.tsx` + `components/dashboard/`)

**Files:** Create `components/dashboard/Dashboard.tsx` (`"use client"`, SWR), `ProjectCard.tsx`, `AddCard.tsx`, `EmptyState.tsx`, `lib/hooks.ts` (+ `lib/__tests__/hooks.test.ts`), and tests `components/dashboard/__tests__/{Dashboard,ProjectCard,AddCard,EmptyState}.test.tsx`. Modify `app/page.tsx` to render `<Dashboard/>`. Port from `app/dashboard.jsx`.

**Data consumed:** `GET /api/projects` → `Project[]` (contract §7, type §9 `Project` with `currentSummary`, `currentAvalancheSummary`, `currentSnowpackSummary`). Card stats route through `lib/units.ts`.

**Props interfaces:**
```ts
// lib/hooks.ts ("use client")
export function useProjects(): { projects: Project[] | undefined; isLoading: boolean; error: unknown };
export function useProject(id: string): { project: Project | undefined; isLoading: boolean; error: unknown };
export function useWeather(id: string): { blob: CombinedForecastBlob | undefined; isLoading: boolean; error: unknown };
export function useNwac(id: string): { nwac: NwacForecast | { season: "summer" } | undefined; ... };
export function useSnotel(id: string): { snotel: SnotelData | undefined; ... };
export function useMountains(): { mountains: Mountain[] | undefined; ... };
export function useMountain(slug: string): { data: { mountain: Mountain; conditions: MountainConditions | null } | undefined; ... };
// shared fetcher: const fetcher = (u: string) => fetch(u).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });

// Dashboard.tsx
interface DashboardProps { /* none — fetches via useProjects() */ }
// ProjectCard.tsx (server-ok; takes a fully-typed project; reads useUnits → "use client")
interface ProjectCardProps { project: Project }
// AddCard.tsx (server-ok; Link to /projects/new)
interface AddCardProps { /* none */ }
// EmptyState.tsx
interface EmptyStateProps { icon?: React.ReactNode; title: string; body: string; cta?: React.ReactNode }
```

**Acceptance criteria** (ref `app/dashboard.jsx` + `.proj-*` CSS):
- Page head: `.kicker` ("Washington Cascades · Winter" — derive a static kicker for POC), `.page-title` "Your projects", `.page-sub`, and a right-aligned `LastUpdated` (max `currentSummary.updatedAt` across projects, or "—").
- `.proj-grid` (`repeat(auto-fill, minmax(340px,1fr))`, single column ≤680) of `ProjectCard`s + a trailing `AddCard`.
- **ProjectCard** maps to the real `Project`: `.pc-top` (region kicker from `mountainSlug`/region + `.pc-name` = `project.name`) and a `ConditionTone chip` from `currentSummary.tone`; `.pc-cond` (WeatherIcon — derive code from summary precipType/cloud or default; summit hi/lo via `fmtTemp(currentSummary.targetDateHigh/Low)`; `PrecipChip` from `currentSummary.precipType`; wind via `fmtWind(currentSummary.targetDateWind)`); `.pc-stats` 3-stat row — **Freezing** (`fmtDist(currentSummary.freezingLevelFt, {k:true})`), **Max wind** (`fmtWind(targetDateWind)`), **Snowpack** (`currentSnowpackSummary.percentOfMedian`% with good/caution/alert color by ≥90/≥70); `.pc-danger` `DangerChip` from `currentAvalancheSummary.dangerUpper` + zone label; `.pc-foot` target date range (`lib/format` `fmtRange`) + arrow. Card is a `<Link href={\`/projects/${project.id}\`}>` styled `.proj-card`. Handle **pending** (`lastRefreshStatus==="pending"` / missing `currentSummary`) → show muted "Pending first refresh" placeholders (no NaN) per DESIGN §20.
- **AddCard:** dashed `.proj-card` "Pin a peak / Track a new objective" → `/projects/new`.
- **EmptyState:** when `projects.length===0`, render `.empty` with pin icon, "No projects yet", body, and a "Pin a Peak" CTA (instead of the grid).
- Loading: a `LoadingSpinner`/skeleton while `isLoading`; error → a friendly inline message (full error/empty polish is P6, but don't crash).

**Vitest test specs** (mock SWR via mocking `lib/hooks` or `global.fetch`):
```tsx
// ProjectCard.test.tsx
const project: Project = { /* build a full §9 Project: tone:"caution", targetDateHigh:18, targetDateLow:2,
  targetDateWind:24, freezingLevelFt:5815, precipType:"snow", percentOfMedian:108, dangerUpper:3, ... */ } as any;
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
beforeEach(() => useUnits.setState(DEFAULT_UNITS));
it("shows name, tone word, stats in imperial", () => {
  render(<ProjectCard project={project} />);
  expect(screen.getByText(project.name)).toBeInTheDocument();
  expect(screen.getByText("Marginal")).toBeInTheDocument();          // tone caution
  expect(screen.getByText("Considerable")).toBeInTheDocument();      // danger 3
  expect(screen.getByText(/5\.8k ft|5,815 ft/)).toBeInTheDocument(); // freezing
});
it("re-renders metric units when store flips", () => {
  render(<ProjectCard project={project} />);
  act(() => useUnits.getState().set({ temp: "C", wind: "kmh", dist: "m" }));
  expect(screen.getByText(/km\/h/)).toBeInTheDocument();
});
it("shows pending state when no summary", () => {
  render(<ProjectCard project={{ ...project, currentSummary: undefined, lastRefreshStatus: "pending" } as any} />);
  expect(screen.getByText(/pending first refresh/i)).toBeInTheDocument();
});
// Dashboard.test.tsx — mock useProjects
vi.mock("@/lib/hooks", () => ({ useProjects: vi.fn() }));
it("renders a card per project + the add card", () => {
  (useProjects as Mock).mockReturnValue({ projects: [project, { ...project, id: "p2", name: "Baker" }], isLoading: false });
  render(<Dashboard />);
  expect(screen.getAllByText(/Marginal/).length).toBe(2);
  expect(screen.getByText(/pin a peak/i)).toBeInTheDocument();       // AddCard
});
it("renders EmptyState when no projects", () => {
  (useProjects as Mock).mockReturnValue({ projects: [], isLoading: false });
  render(<Dashboard />);
  expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
});
// hooks.test.ts — stub global.fetch, assert URL + parsed json
it("useProjects fetches /api/projects", async () => { /* renderHook + waitFor */ });
```

**Playwright spec** (`tests/e2e/dashboard.spec.ts`, desktop + mobile, against emulator-seeded data):
```ts
test("dashboard shows project cards and last-updated", async ({ page }, ti) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  await expect(page.locator(".proj-card").first()).toBeVisible();
  await page.screenshot({ path: ti.outputPath("dashboard-populated.png"), fullPage: true });
});
test("units toggle converts a stat", async ({ page }) => {
  await page.goto("/");
  const freezing = page.locator(".pc-stat").filter({ hasText: /Freezing/i }).first();
  await page.getByRole("tab", { name: "m" }).click();      // dist → meters
  await expect(freezing).toContainText(/m\b/);
});
test("theme toggle flips data-theme", async ({ page }, ti) => {
  await page.goto("/");
  await page.getByRole("button", { name: /toggle theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "slate");
  await page.screenshot({ path: ti.outputPath("dashboard-slate.png"), fullPage: true });
});
// Empty: seed an empty project set (or route-mock) then screenshot dashboard-empty.png
```
Compare `dashboard-populated.png` / `dashboard-slate.png` against the Cirque Dashboard screen.

- [ ] Step 1: Write `lib/__tests__/hooks.test.ts` + the four dashboard test files → **FAIL**.
- [ ] Step 2: Implement `lib/hooks.ts`, then `EmptyState`, `AddCard`, `ProjectCard`, `Dashboard`; wire `app/page.tsx`.
- [ ] Step 3: Run unit suite → **PASS**. Run `tests/e2e/dashboard.spec.ts` (desktop+mobile) → **PASS**, screenshots saved.
- [ ] Step 4: Commit — `git commit -m "feat(p4): dashboard, project card (units-aware), add card, empty state"`

---

## Task 8: Create flow (`app/projects/new/page.tsx` + `components/create/`)

**Files:** Create `components/create/PinAPeak.tsx` (`"use client"`), `MountainSearch.tsx`, `MountainMap.tsx`, `DateRangePicker.tsx`, `app/projects/new/page.tsx`, and tests `components/create/__tests__/{PinAPeak,MountainSearch,DateRangePicker}.test.tsx`. Port from `app/create.jsx`; add a Mapbox map (new vs. prototype, which had none — keep the form layout identical).

**Data consumed:** `GET /api/mountains` → `Mountain[]` (typeahead). `POST /api/projects {name,mountainId,targetDateStart,targetDateEnd,notes?}` → `Project` (contract §7); on success redirect to `/projects/{id}` and surface the pending-first-refresh note.

**Props interfaces:**
```ts
// MountainSearch.tsx ("use client")
interface MountainSearchProps {
  mountains: Mountain[]; value: Mountain | null;
  onSelect: (m: Mountain) => void; onClear: () => void;
}
// MountainMap.tsx ("use client") — Mapbox GL; falls back to a labeled placeholder if no token
interface MountainMapProps { lat: number; lng: number; name: string; height?: number }
// DateRangePicker.tsx ("use client")
interface DateRangePickerProps {
  start: string; end: string; minDate: string; maxDate: string; // maxDate = today + 14d
  onStart: (d: string) => void; onEnd: (d: string) => void;
}
// PinAPeak.tsx ("use client") — owns form state, calls useMountains() + POST
interface PinAPeakProps { /* none */ }
```

**Acceptance criteria** (ref `app/create.jsx` + `.create-*`/`.mtn-*`/`.dates`/`.field` CSS):
- Single-column `.create-wrap` (max 620px): back button (`.btn-ghost`) → `/`, `.kicker` "New project", `.page-title` "Pin a peak", `.page-sub`.
- **MountainSearch:** `.mtn-search` input (search icon, `autoFocus`) filtering `mountains` by name (case-insensitive); `.mtn-results` dropdown of `.mtn-opt` (mountain icon, name, `region · summit … ft`); selecting shows `.mtn-chosen` selected card with a "Change" button. Convert the summit elevation through `fmtDist` (units-aware). Keyboard: results navigable by click (arrow-key roving is P6).
- **MountainMap:** below the chosen card, render a Mapbox GL map centered on the selected mountain with a marker; uses `NEXT_PUBLIC_MAPBOX_TOKEN`. If the token is missing/empty, render the prototype's striped `.sat-tile`-style labeled placeholder ("Map — {name}") so tests/CI without a token still pass. Only shown once a mountain is chosen.
- Auto-filled **project name** (`.field` input): on select, prefill `"{short name} — Objective"` if empty (port the `replace("Mount ","")` heuristic).
- **DateRangePicker:** `.dates` two `<input type="date">`; `minDate` = today (POC date `2026-06-14`), `maxDate` = today + 14 days; `end` min is `start`; ≤14-days-out enforced via `max`. (Contract: target ≤14 days out — spec §2 A2.)
- **Notes** textarea (`.field`, optional). **Footer** `.create-foot`: the pending-first-refresh `.note-card` ("New projects show a 'pending first refresh' state until the next hourly cycle picks them up.") + a `.btn-primary` "Pin project" disabled until `chosen && name && start && end`.
- **Submit:** `POST /api/projects` with the form payload; on 200, `router.push(\`/projects/${created.id}\`)`. Disable button + show a spinner while posting; show an inline error on failure.

**Vitest test specs:**
```tsx
// MountainSearch.test.tsx
const mts = [{ slug:"mt-rainier", name:"Mount Rainier", region:"cascades-south", elevations:{summit:14410,...} }, ...] as Mountain[];
it("filters by query and selects", () => {
  const onSelect = vi.fn();
  render(<MountainSearch mountains={mts} value={null} onSelect={onSelect} onClear={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/Rainier/i), { target: { value: "baker" } });
  fireEvent.click(screen.getByText("Mount Baker"));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: "mt-baker" }));
});
it("shows no-match message", () => {
  render(<MountainSearch mountains={mts} value={null} onSelect={vi.fn()} onClear={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/Rainier/i), { target: { value: "zzz" } });
  expect(screen.getByText(/no peaks match/i)).toBeInTheDocument();
});
// DateRangePicker.test.tsx
it("caps end at maxDate and start at minDate", () => {
  render(<DateRangePicker start="2026-06-15" end="2026-06-16" minDate="2026-06-14" maxDate="2026-06-28" onStart={vi.fn()} onEnd={vi.fn()} />);
  const [s, e] = screen.getAllByDisplayValue(/2026-06/);
  expect(s).toHaveAttribute("min", "2026-06-14");
  expect(e).toHaveAttribute("max", "2026-06-28");
});
// PinAPeak.test.tsx — mock useMountains + global.fetch(POST), mock next/navigation useRouter
it("disables submit until valid then POSTs and redirects", async () => {
  const push = vi.fn();
  vi.mocked(useRouter).mockReturnValue({ push } as any);
  vi.mocked(useMountains).mockReturnValue({ mountains: mts, isLoading: false } as any);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "new-1" }) }) as any;
  render(<PinAPeak />);
  expect(screen.getByRole("button", { name: /pin project/i })).toBeDisabled();
  fireEvent.click(screen.getByText("Mount Rainier"));          // select
  fireEvent.click(screen.getByRole("button", { name: /pin project/i }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "POST" })));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/new-1"));
});
it("shows the pending-first-refresh note", () => {
  vi.mocked(useMountains).mockReturnValue({ mountains: mts } as any);
  render(<PinAPeak />);
  expect(screen.getByText(/pending first refresh/i)).toBeInTheDocument();
});
```
> Mock `mapbox-gl` in tests (`vi.mock("mapbox-gl")`) so MountainMap doesn't try to render WebGL; assert the placeholder path when no token.

**Playwright spec** (`tests/e2e/create.spec.ts`, desktop + mobile):
```ts
test("pin a peak flow", async ({ page }, ti) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "Pin a peak" })).toBeVisible();
  await page.getByPlaceholderText(/Rainier/i).fill("Rainier");
  await page.getByText("Mount Rainier").click();
  await expect(page.locator(".mtn-chosen")).toBeVisible();
  await page.screenshot({ path: ti.outputPath("create.png"), fullPage: true });
});
```

- [ ] Step 1: Write the create test files → **FAIL**.
- [ ] Step 2: Implement `MountainSearch`, `DateRangePicker`, `MountainMap` (with token fallback), then `PinAPeak`; wire `app/projects/new/page.tsx`. Add `import "mapbox-gl/dist/mapbox-gl.css"` in the map component.
- [ ] Step 3: Run unit suite → **PASS**. Run `tests/e2e/create.spec.ts` → **PASS**, screenshot saved.
- [ ] Step 4: Commit — `git commit -m "feat(p4): pin-a-peak create flow (typeahead, mapbox, date range, POST)"`

---

## Task 9: Project Detail calm-layer shell (`app/projects/[id]/page.tsx` + ProjectHeader + Verdict)

**Files:** Create `components/project/ProjectDetail.tsx` (`"use client"`, orchestrates SWR + panels), `ProjectHeader.tsx`, `Verdict.tsx`, `app/projects/[id]/page.tsx` (async params), and tests `components/project/__tests__/{ProjectHeader,Verdict,ProjectDetail}.test.tsx`. Port from `app/detail.jsx` (sticky head + verdict).

**Data consumed:** `GET /api/projects/[id]` → `Project`; combined blob via `useWeather(id)`; NWAC via `useNwac(id)`; SNOTEL via `useSnotel(id)`. Verdict + tone come from `project.currentSummary` (computed server-side per contract §0/§6 — the UI does NOT recompute tone here, it renders `currentSummary.tone` + `currentSummary.verdict`).

**Props interfaces:**
```ts
// app/projects/[id]/page.tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element>;
// ProjectDetail.tsx
interface ProjectDetailProps { id: string }
// ProjectHeader.tsx (sticky sub-header)
interface ProjectHeaderProps {
  project: Project;                      // name, mountainName, dates, lastRefreshedAt
  modelLabHref: string;                  // `/projects/${id}/models`
}
// Verdict.tsx
interface VerdictProps { summary: CurrentSummary; targetDateStart: string } // tone + verdict sentence + 3 Stats
```

**Acceptance criteria** (ref `app/detail.jsx` + `.detail-head`/`.detail-body`/`.panel`):
- `app/projects/[id]/page.tsx` is a thin **Server Component**: `const { id } = await params; return <ProjectDetail id={id} />;`.
- **ProjectHeader** = `.detail-head` sticky (`top: 64px`), `.detail-head-in`: `.dh-back` (← `/`, `aria-label="Back"`), `.dh-title` = project name, `.dh-meta` (mountain name + icon, date range via `fmtRange`, `LastUpdated` from `lastRefreshedAt`), and `.dh-actions` = `CopyLinkButton` ("Share") + a `.btn-primary` "Model lab" → `modelLabHref` (the page itself is built in P5; link present now).
- **Verdict** = first `.panel`: grid `1fr auto`; left = `.kicker` with a `ConditionTone` dot + "The call for {long weekday, month day}" (from `targetDateStart` via `lib/format`) and the **serif verdict sentence** = `summary.verdict` (rendered as the editorial paragraph, `text-wrap: pretty`); right = three `Stat`s — **Summit** (`fmtTemp(summary.targetDateHigh)`, sub `low {fmtTemp(targetDateLow)}`), **Wind** (`fmtWind(summary.targetDateWind)`, sub gust if available), **Freezing** (`fmtDist(summary.freezingLevelFt)`, sub "at noon"). All via `useUnits`.
- **ProjectDetail** renders, in **contract §0 IA order**:
  1. `<Verdict/>`
  2. `<DailyOutlook/>` (Task 10)
  3. **FreezingLevelHero placeholder** — a `.panel` with `PanelHead` ("Signature view / Freezing level cross-section") and a clearly-marked placeholder block: `data-testid="freezing-level-placeholder"` containing the text "Freezing-level cross-section — built in P5". (Do NOT build the SVG hero here.)
  4. **ConfidenceStrip placeholder** — `.panel` with `data-testid="confidence-placeholder"` + text "Forecast confidence — built in P5".
  5. `.detail-grid.cols-3` → `<AvalanchePanel/>` (Task 11) + `<SnowpackPanel/>` (Task 12)
  6. `.detail-grid.cols-2` → `<SatellitePanel/>` + `<NotesPanel/>` (Task 13)
- Loading: skeleton/spinner while the project query resolves; pending project (`currentSummary` missing) → render the shell with "Pending first refresh" verdict copy instead of NaN.

**Vitest test specs:**
```tsx
// Verdict.test.tsx
const summary = { tone:"caution", verdict:"A cold window holds before a front edges in.",
  targetDateHigh:18, targetDateLow:2, targetDateWind:24, freezingLevelFt:5815, ... } as CurrentSummary;
beforeEach(() => useUnits.setState(DEFAULT_UNITS));
it("renders tone dot+word context, the verdict sentence, and three stats", () => {
  render(<Verdict summary={summary} targetDateStart="2026-02-14" />);
  expect(screen.getByText(/The call for/)).toBeInTheDocument();
  expect(screen.getByText(summary.verdict)).toBeInTheDocument();
  expect(screen.getByText(/24 mph/)).toBeInTheDocument();
  expect(screen.getByText(/5,815 ft/)).toBeInTheDocument();
});
// ProjectHeader.test.tsx (mock next/navigation)
it("has back, share, model-lab, and shows the date range", () => {
  render(<ProjectHeader project={proj} modelLabHref="/projects/p1/models" />);
  expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /model lab/i })).toHaveAttribute("href", "/projects/p1/models");
});
// ProjectDetail.test.tsx — mock all hooks
it("renders panels in IA order with P5 placeholders", () => {
  /* mock useProject/useWeather/useNwac/useSnotel */
  render(<ProjectDetail id="p1" />);
  expect(screen.getByTestId("freezing-level-placeholder")).toBeInTheDocument();
  expect(screen.getByTestId("confidence-placeholder")).toBeInTheDocument();
  // order: verdict before daily before avalanche
});
```

- [ ] Step 1: Write the three test files → **FAIL**.
- [ ] Step 2: Implement `Verdict`, `ProjectHeader`, then `ProjectDetail` (with the two P5 placeholders + imports of Tasks 10–13 panels), and `app/projects/[id]/page.tsx`.
- [ ] Step 3: Run → **PASS** (Tasks 10–13 panels can be stubbed first, then filled; keep this task's tests green by mocking).
- [ ] Step 4: Commit — `git commit -m "feat(p4): project detail shell, sticky header, verdict (P5 placeholders marked)"`

---

## Task 10: DailyOutlook (`components/project/DailyOutlook.tsx`)

**Files:** Create `components/project/DailyOutlook.tsx` (`"use client"`), `lib/derive.ts` (+ `lib/__tests__/derive.test.ts`), and `components/project/__tests__/DailyOutlook.test.tsx`. Port the DailyOutlook logic from `app/detail.jsx` (lines 150–294) and the aggregation/precip-type logic from `app/data.js`.

**Data consumed:** the combined blob `CombinedForecastBlob` (`useWeather(id)` → `hrrr|gfs|ecmwf: ModelSeries`). Derive daily/period/hourly cells from the blob's parallel arrays (`time`, `temperature_2m` per band via `temp_base_f/temp_mid_f/temp_summit_f`, `wind_speed_10m`, `wind_gusts_10m`, `precipitation`, `precipitation_probability`, `snowfall`, `freezing_level_height`, `weather_code`). All temps/wind via `useUnits`; hourly scoped to next 48h labeled "HRRR 3 km".

**`lib/derive.ts` API** (pure, unit-agnostic numeric — TDD):
```ts
import type { ModelSeries } from "@/lib/types";
export type Band = "base" | "mid" | "summit";
export interface Cell {
  key: string; label: string; sub?: string; isTarget: boolean; single?: boolean; src?: "HRRR" | "GFS";
  hi: number; lo: number; wind: number; gust: number; precip: number; snow: number; pop: number; code: number;
}
export interface Group { label: string; span: number; isTarget: boolean }

// index helpers over a ModelSeries (arrays aligned to series.time, local "YYYY-MM-DDTHH:00")
export function bandTemps(s: ModelSeries, band: Band): (number | null)[]; // picks temp_<band>_f
export function dayKeys(s: ModelSeries): string[];                        // unique YYYY-MM-DD in order
export function aggregate(s: ModelSeries, band: Band, indices: number[]): Omit<Cell, "key"|"label"|"isTarget">;
export function dailyCells(s: ModelSeries, band: Band, targetStart: string, targetEnd: string): Cell[];
export function periodCells(s: ModelSeries, band: Band, targetStart: string, targetEnd: string): { cells: Cell[]; groups: Group[] };
export function hourlyCells(hrrr: ModelSeries | null, gfs: ModelSeries, band: Band, nowIso: string, targetStart: string, targetEnd: string):
  { cells: Cell[]; groups: Group[] };   // next 48h, HRRR where available else GFS
export function precipFor(c: Pick<Cell,"snow"|"precip"|"pop">): { text: string; varName: string; icon: "flake"|"drop"|"cloud"|"sun" };
```
Rules (port from prototype): `aggregate` → hi=max band temp, lo=min, wind=max wind, gust=max gust, precip=sum, snow=sum, pop=max, code = noon (12:00) row's `weather_code` (or middle row). Period split Morning 6–12 / Midday 12–18 / Night 18–24. Hourly: from first index with `time >= now`, take ≤48 rows, prefer HRRR row when present else GFS, group by day. `precipFor`: snow>0.2 → snow (accent); precip>0.02 → drop (`--d3`); pop>40 → "chance" (muted); else "dry" (faint).

**DailyOutlook props:**
```ts
interface DailyOutlookProps {
  blob: CombinedForecastBlob; nowIso: string;
  targetStart: string; targetEnd: string;
  mountain: Pick<Mountain, "elevations"> & { bandNames?: Record<Band, string> };
  modelLabHref: string;
}
```

**Acceptance criteria** (ref `app/detail.jsx` DailyOutlook + `.daily*`/`.day-tile`/`.daily-trend`):
- `.panel` with `PanelHead` ("Daily outlook / The days around your window") and a **Band `Segmented`** (Base|Mid|Summit, default **Summit** per spec §2 #13) on the right.
- A sub-row: a `.mono-dim` band/elevation readout (`{bandName} · {fmtDist(elevations[band])}` + "daytime high / overnight low" or "hourly temperature") and a **Zoom `Segmented`** (Daily | AM·Mid·PM | Hourly).
- The `.daily` container: optional `.daily-groups` (period/hour), the **temperature trend ribbon** (`.daily-trend` SVG, `viewBox="0 0 ${n*100} 72"`, `preserveAspectRatio="none"`) drawn inline (solid high line `--accent` 2.5, dashed low `--muted` 1.75 except hourly single-temp, faint area fill 0.07, target-window rect `--target-band`, per-point dots), then the `.daily-grid` of `.day-tile`s (weekday/date, WeatherIcon, hi/lo, wind+gust, precip chip). Daily = 7 fluid columns; period/hour = horizontal scroll with fixed `colW` (period 92, hour 48); `.is-target` shading + a `.dt-flag` "Target" on the first target cell.
- The **target window** is highlighted at every zoom (ribbon rect + tile shading + group `.is-target`).
- **Hourly** scoped to next 48h, single-temp line, legend shows "Inside the 48-h window · HRRR 3 km" with a clock icon.
- All temperatures/winds rendered through `useUnits`; the **ribbon Y axis converts** too (convert cell hi/lo via `convTemp` before scaling). Footer: `.daily-legend` + a `DrillLink` "Open full hourly grid & raw data" → `modelLabHref`.

**Vitest test specs:**
```ts
// derive.test.ts — build a small synthetic ModelSeries (2–3 days, hourly) with known values
it("dayKeys returns unique ordered days", () => { expect(dayKeys(series)).toEqual(["2026-02-12","2026-02-13"]); });
it("aggregate computes hi/lo/wind/sum precip over indices", () => {
  const a = aggregate(series, "summit", [0,1,2]);
  expect(a.hi).toBe(/*max*/); expect(a.precip).toBeCloseTo(/*sum*/);
});
it("dailyCells flags target days", () => {
  const cells = dailyCells(series, "summit", "2026-02-13", "2026-02-13");
  expect(cells.find(c => c.label.includes("Fri"))?.isTarget).toBe(true);
});
it("hourlyCells caps at 48 and prefers HRRR", () => {
  const { cells } = hourlyCells(hrrr, gfs, "summit", "2026-02-12T00:00", "2026-02-13", "2026-02-13");
  expect(cells.length).toBeLessThanOrEqual(48);
  expect(cells[0].src).toBe("HRRR");
});
it("precipFor classifies", () => {
  expect(precipFor({ snow: 1, precip: 0.1, pop: 80 }).icon).toBe("flake");
  expect(precipFor({ snow: 0, precip: 0, pop: 10 }).text).toBe("dry");
});
```
```tsx
// DailyOutlook.test.tsx
beforeEach(() => useUnits.setState(DEFAULT_UNITS));
it("defaults to Summit band + Daily zoom, 7 day tiles", () => {
  render(<DailyOutlook blob={blob} nowIso="2026-02-12T00:00" targetStart="2026-02-14" targetEnd="2026-02-15"
    mountain={{ elevations:{base:5400,mid:10000,summit:14411} }} modelLabHref="/x" />);
  expect(screen.getByRole("tab", { name: "Summit" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByText("°", { exact: false }).length).toBeGreaterThan(0);
});
it("switching to Hourly shows the 48-h HRRR legend", () => {
  render(<DailyOutlook .../>);
  fireEvent.click(screen.getByRole("tab", { name: "Hourly" }));
  expect(screen.getByText(/Inside the 48-h window · HRRR 3 km/)).toBeInTheDocument();
});
it("temperatures convert with the units store", () => {
  render(<DailyOutlook .../>);
  act(() => useUnits.getState().setTemp("C"));
  // a known hi that is e.g. 18°F → -8°C appears
});
it("marks the target window", () => {
  const { container } = render(<DailyOutlook .../>);
  expect(container.querySelector(".day-tile.is-target")).toBeTruthy();
  expect(container.querySelector(".dt-flag")).toHaveTextContent("Target");
});
```

**Playwright spec** (`tests/e2e/detail.spec.ts`, desktop + mobile): on `/projects/{seededId}`, screenshot the outlook at each zoom level:
```ts
test("daily outlook three zoom levels", async ({ page }, ti) => {
  await page.goto(`/projects/${SEEDED}`);
  const panel = page.locator(".daily").first();
  await expect(panel).toBeVisible();
  await page.screenshot({ path: ti.outputPath("outlook-daily.png"), fullPage: true });
  await page.getByRole("tab", { name: "AM·Mid·PM" }).click();
  await page.screenshot({ path: ti.outputPath("outlook-period.png"), fullPage: true });
  await page.getByRole("tab", { name: "Hourly" }).click();
  await expect(page.getByText(/HRRR 3 km/)).toBeVisible();
  await page.screenshot({ path: ti.outputPath("outlook-hourly.png"), fullPage: true });
});
```

- [ ] Step 1: Write `derive.test.ts` + `DailyOutlook.test.tsx` → **FAIL**.
- [ ] Step 2: Implement `lib/derive.ts` (TDD), then `DailyOutlook` (band + zoom Segmenteds, ribbon SVG, grid, units).
- [ ] Step 3: Run unit suites → **PASS**. Run detail e2e (outlook) → **PASS**, three screenshots saved.
- [ ] Step 4: Commit — `git commit -m "feat(p4): DailyOutlook (Daily/AM·Mid·PM/Hourly-48h) + derive helpers"`

---

## Task 11: AvalanchePanel + DangerColumn + AspectRose (`components/project/`)

**Files:** Create `components/project/AvalanchePanel.tsx`, `components/project/DangerColumn.tsx`, `components/project/AspectRose.tsx`, and tests `components/project/__tests__/{AvalanchePanel,DangerColumn,AspectRose}.test.tsx`. Port from `app/detail.jsx` `AvalanchePanel` + `app/shared.jsx` `DangerColumn` + `app/hero.jsx` `AspectRose`.

**Data consumed:** `GET /api/projects/[id]/nwac` → `NwacForecast | { season: "summer", … }` (contract §7; type §9). Danger uses `danger.current`/`danger.tomorrow` (`{upper,middle,lower}` ints 1–5/-1); problems have `aspects: {upper|middle|lower: {N..NW bool}}`.

**Props interfaces:**
```ts
// DangerColumn.tsx
interface DangerColumnProps { danger: NwacDanger; compact?: boolean }   // upper/middle/lower 1–5/-1
// AspectRose.tsx
interface AspectRoseProps { aspects: Record<"upper"|"middle"|"lower", Record<string, boolean>>; size?: number }
// AvalanchePanel.tsx
interface AvalanchePanelProps { nwac: NwacForecast | { season: "summer" } | null | undefined }
```

**Acceptance criteria:**
- **DangerColumn** = `.danger-col` with three `.danger-row`s (Upper/Middle/Lower → `danger.upper/middle/lower`): band label + a 5-segment `.danger-meter` (segments ≤ level filled with that level's NAC color, rest `--line`) + a `.danger-tag` "{level} · {label}". `compact` hides tags + narrows. **Accessibility: number + label + meter (not color-only).** For `-1/0` (no rating) render an empty meter + "No rating" tag.
- **AspectRose** = 8-sector × 3-ring SVG (rings = Low/Mid/High = lower/middle/upper). A sector wedge is filled (accent/caution) when `aspects[band][dir]` is true; ring opacity encodes elevation band. 8 compass dirs N..NW. Includes `role="img"` + `aria-label` summarizing affected aspects (a11y; not color-only). Default `size=108`.
- **AvalanchePanel** = `.panel`: `PanelHead` ("NWAC · {zoneName} / Avalanche danger") + a `DangerChip` (current upper). `.avy-today` grid: left = "Today" `DangerColumn(danger.current)` + "Tomorrow" `DangerColumn(danger.tomorrow, compact)`; right = `.bottomline` (`nwac.bottomLine`). Then a `.problem` list (each: `AspectRose` of `problem.aspects` + `.problem-body` with name, `.ptag` likelihood + "Size {sizeMin}–{sizeMax}", description). A `DrillLink`/expander to read `hazardDiscussion`.
- **Summer/no-forecast state:** when `season==="summer"` (or `nwac` null / `productType !== "forecast"`), render the `.avy-banner` "Summer operations — no active avalanche forecast" (spec §2 #4 / DESIGN §20) instead of danger columns.

**Vitest test specs:**
```tsx
// DangerColumn.test.tsx
it("renders three bands with number+label (a11y, not color-only)", () => {
  render(<DangerColumn danger={{ upper:3, middle:3, lower:2 }} />);
  expect(screen.getByText("Upper")).toBeInTheDocument();
  expect(screen.getByText(/3 · Considerable/)).toBeInTheDocument();
  expect(screen.getByText(/2 · Moderate/)).toBeInTheDocument();
});
it("no-rating renders 'No rating'", () => {
  render(<DangerColumn danger={{ upper:-1, middle:-1, lower:-1 }} />);
  expect(screen.getAllByText(/no rating/i).length).toBe(3);
});
// AspectRose.test.tsx
it("is an accessible image labelled with affected aspects", () => {
  render(<AspectRose aspects={{ upper:{N:true,NE:true,E:false,SE:false,S:false,SW:false,W:false,NW:false}, middle:{}, lower:{} }} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(/N|NE/);
});
// AvalanchePanel.test.tsx
it("renders danger + problems in winter", () => {
  render(<AvalanchePanel nwac={winterNwac} />);
  expect(screen.getByText(/Avalanche danger/)).toBeInTheDocument();
  expect(screen.getByText(winterNwac.problems[0].name)).toBeInTheDocument();
  expect(screen.getByText(winterNwac.bottomLine)).toBeInTheDocument();
});
it("shows the summer off-season banner", () => {
  render(<AvalanchePanel nwac={{ season: "summer" } as any} />);
  expect(screen.getByText(/summer operations/i)).toBeInTheDocument();
});
```

**Playwright spec** (in `detail.spec.ts`): screenshot `.panel` containing "Avalanche danger" → `avalanche.png` (desktop + mobile). Verify a rose SVG and a danger meter are visible.

- [ ] Step 1: Write the three test files → **FAIL**.
- [ ] Step 2: Implement `DangerColumn`, `AspectRose`, `AvalanchePanel` (incl. summer state).
- [ ] Step 3: Run unit suite → **PASS**. Capture `avalanche.png` in the detail e2e.
- [ ] Step 4: Commit — `git commit -m "feat(p4): avalanche panel, danger column, aspect rose (NAC colors + a11y + summer state)"`

---

## Task 12: SnowpackPanel (`components/project/SnowpackPanel.tsx`)

**Files:** Create `components/project/SnowpackPanel.tsx` + `components/project/__tests__/SnowpackPanel.test.tsx`. Port from `app/detail.jsx` `SnowpackPanel`.

**Data consumed:** `GET /api/projects/[id]/snotel` → `SnotelData` (contract §7/§9): `current.{snowDepthIn,sweIn,percentOfMedian}`, `trend: SnotelReading[]` (30-day), `stationName`, `elevationFt`. Snow depth via `useUnits` (dist axis governs depth per contract §12a).

**Props interface:**
```ts
interface SnowpackPanelProps { snotel: SnotelData | null | undefined }
```

**Acceptance criteria** (ref `app/detail.jsx` SnowpackPanel + `.snotel-*`):
- `.panel` with `PanelHead` ("SNOTEL · {stationName} / Snowpack").
- `.snotel-top`: `Stat` "Snow depth" (`fmtDist(current.snowDepthIn... )` — note: depth is in **inches**; the dist axis is ft/m. For the POC, snow depth is reported in inches in the data; render inches with an in⇄cm conversion tied to the dist axis (ft→in display, m→cm). Spec §12a note: precip/snow stay inches in POC; **snow depth follows the height axis** ("governs … SNOTEL snow depth"). Implement: ft → show inches `{n} in`; m → show centimeters `{round(n*2.54)} cm`.) and `Stat` "SWE" (inches, not unit-toggled — water equivalent stays inches in POC).
- Percent-of-median headline: large serif `{percentOfMedian}%` colored by band (≥90 `--good`, ≥70 `--caution`, else `--alert`) + "of median SWE for today" + `.mono-dim` "{stationName} · {fmtDist(elevationFt)}".
- `.snotel-trend`: `.mono-dim` "Snow depth · last 30 days" + an `AreaSpark` of `trend.map(t => ({ v: t.snowDepthIn }))` (converted to the active depth unit), `color="var(--accent)"`, `fill="var(--accent-soft)"`, `h=56`.
- A `.note-card` explaining SWE.
- Null/missing → a muted "Snowpack data pending" state (no crash).

**Vitest test specs:**
```tsx
beforeEach(() => useUnits.setState(DEFAULT_UNITS));
const snotel = { stationName:"Paradise", elevationFt:5430,
  current:{ snowDepthIn:112, sweIn:38.2, percentOfMedian:108 },
  trend:[{snowDepthIn:90},{snowDepthIn:100},{snowDepthIn:112}] } as any as SnotelData;
it("shows depth, SWE, and percent-of-median with color band", () => {
  render(<SnowpackPanel snotel={snotel} />);
  expect(screen.getByText("Snow depth")).toBeInTheDocument();
  expect(screen.getByText("108%")).toBeInTheDocument();
});
it("converts depth to cm when dist=m", () => {
  render(<SnowpackPanel snotel={snotel} />);
  act(() => useUnits.getState().setDist("m"));
  expect(screen.getByText(/cm/)).toBeInTheDocument();
});
it("renders the 30-day AreaSpark", () => {
  const { container } = render(<SnowpackPanel snotel={snotel} />);
  expect(container.querySelector("svg path")).toBeTruthy();
});
it("handles missing data", () => { render(<SnowpackPanel snotel={null} />); expect(screen.getByText(/pending/i)).toBeInTheDocument(); });
```

**Playwright spec** (in `detail.spec.ts`): screenshot the Snowpack panel → `snowpack.png` (desktop + mobile); assert the AreaSpark SVG renders.

- [ ] Step 1: Write `SnowpackPanel.test.tsx` → **FAIL**.
- [ ] Step 2: Implement `SnowpackPanel` (depth unit handling + AreaSpark + color band).
- [ ] Step 3: Run → **PASS**. Capture `snowpack.png`.
- [ ] Step 4: Commit — `git commit -m "feat(p4): snowpack panel (depth via units, 30-day AreaSpark)"`

---

## Task 13: SatellitePanel + NotesPanel (`components/project/`)

**Files:** Create `components/project/SatellitePanel.tsx`, `components/project/NotesPanel.tsx`, and tests `components/project/__tests__/{SatellitePanel,NotesPanel}.test.tsx`. Port from `app/detail.jsx` `SatellitePanel` + the inline notes panel.

**Data consumed:** satellite tile + badge from the project's `satelliteCache` (contract §3 `satelliteCache/{mountainId}`: `tileUrlTemplate` (EOX XYZ), `latestImageDate`, `cloudCoverPercent`, `attribution`). For the POC, surface this via the project doc / a small fetch — the panel takes a typed `SatelliteCache | null` prop and the parent supplies it (from the mountain's cache; if no dedicated endpoint, the parent reads it from the project payload). Notes come from `project.notes`.

**Props interfaces:**
```ts
interface SatellitePanelProps { sat: SatelliteCache | null | undefined; mountainName: string }
interface NotesPanelProps { notes: string; zoneName?: string }
```

**Acceptance criteria** (ref `app/detail.jsx` + `.sat-*`/`.meta-row`/`.note-card`):
- **SatellitePanel** = `.panel`: `PanelHead` ("Copernicus Sentinel-2 / Snow coverage") + satellite icon. Grid `150px 1fr`: a `.sat-tile` showing the EOX tile — render an `<img>`/tile from `sat.tileUrlTemplate` (substitute a representative z/x/y for a single static preview tile) OR, when `sat` is null/absent, the striped `.sat-placeholder` ("RGB tile / {mountainName}"). `.sat-meta`: `.meta-row`s Scene date (`fmtDate(latestImageDate)`), Cloud cover (`{cloudCoverPercent}%`), Age (days since `latestImageDate`), and a `.note-card` — **stale state** when age > 14 days ("No recent cloud-free imagery — showing the last clear scene."). Include the EOX attribution text (`sat.attribution` / `NEXT_PUBLIC_EOX_ATTRIBUTION`) somewhere in the panel (contract §12 attribution requirement; full footer is P6).
- **NotesPanel** = `.panel`: `.kicker` "Project notes" + serif "Plan" + `project.notes` paragraph; a footer row with a `Stat` "Zone" ({zoneName}). (Prototype also had a "Party" stat sourced from mock data; the real `Project` has no party field — omit, or show "Zone" only.)

**Vitest test specs:**
```tsx
const sat = { tileUrlTemplate:"https://tiles/{z}/{y}/{x}.jpg", latestImageDate:"2026-02-09",
  cloudCoverPercent:18, attribution:"Sentinel-2 cloudless — EOX", ... } as SatelliteCache;
it("shows scene date, cloud cover, and attribution", () => {
  render(<SatellitePanel sat={sat} mountainName="Mount Rainier" />);
  expect(screen.getByText(/18%/)).toBeInTheDocument();
  expect(screen.getByText(/Sentinel-2 cloudless/)).toBeInTheDocument();
});
it("shows stale state for old imagery", () => {
  render(<SatellitePanel sat={{ ...sat, latestImageDate: "2025-01-01" }} mountainName="X" />);
  expect(screen.getByText(/no recent cloud-free imagery/i)).toBeInTheDocument();
});
it("shows the labeled placeholder when no scene", () => {
  render(<SatellitePanel sat={null} mountainName="Mount Baker" />);
  expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
});
// NotesPanel.test.tsx
it("renders the plan notes and zone", () => {
  render(<NotesPanel notes="Two-day skills weekend." zoneName="West Slopes South" />);
  expect(screen.getByText(/Two-day skills weekend/)).toBeInTheDocument();
  expect(screen.getByText("West Slopes South")).toBeInTheDocument();
});
```

**Playwright spec** (in `detail.spec.ts`): screenshot the Satellite + Notes row → `satellite-notes.png` (desktop + mobile).

- [ ] Step 1: Write the two test files → **FAIL**.
- [ ] Step 2: Implement `SatellitePanel` (tile/placeholder + stale state + attribution) and `NotesPanel`.
- [ ] Step 3: Run → **PASS**. Capture `satellite-notes.png`. Now run the full `detail.spec.ts` (desktop+mobile) and screenshot the full detail page → `detail-full.png`.
- [ ] Step 4: Commit — `git commit -m "feat(p4): satellite + notes panels (stale state, attribution)"`

---

## Task 14: `/mountains` browse + `/mountains/[slug]` (`components/mountains/`)

**Files:** Create `components/mountains/Mountains.tsx` (`"use client"`, SWR), `MountainCard.tsx`, `MountainDetail.tsx` (`"use client"`), `app/mountains/page.tsx`, `app/mountains/[slug]/page.tsx` (async params), and tests `components/mountains/__tests__/{Mountains,MountainCard,MountainDetail}.test.tsx`.

**Data consumed:** `GET /api/mountains` → `Mountain[]` (list). `GET /api/mountains/[slug]` → `{ mountain: Mountain, conditions: MountainConditions | null }` (contract §7). The slug page reuses the calm-layer panels (`Verdict`, `DailyOutlook`, `AvalanchePanel`, `SnowpackPanel`, `SatellitePanel`) **MINUS** ConfidenceStrip, ForecastEvolution, and Model Lab (spec §1, contract §0). `conditions.currentSummary` drives the Verdict + stats; the combined blob (via `conditions.forecastBlobPath`, served by a weather endpoint) drives DailyOutlook.

**Props interfaces:**
```ts
// MountainCard.tsx
interface MountainCardProps { mountain: Mountain }       // → /mountains/{slug}
// Mountains.tsx
interface MountainsProps { /* none — useMountains() */ }
// MountainDetail.tsx
interface MountainDetailProps { slug: string }
// app/mountains/[slug]/page.tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }): Promise<JSX.Element>;
```

**Acceptance criteria:**
- **`/mountains`**: `.page` head ("Peaks" / sub), a `.proj-grid` of `MountainCard`s. Each card: region kicker, mountain name (serif), summit elevation (`fmtDist`, units-aware), NWAC zone + SNOTEL station meta, and a "Browse forecast →" affordance → `/mountains/{slug}`. (Reuse `.proj-card` styling.)
- **`/mountains/[slug]`**: async page → `<MountainDetail slug={slug} />`. Renders a sub-header (mountain name, region, `LastUpdated` from `conditions.updatedAt`) and the calm panels in IA order **without** Confidence/Evolution/Model Lab placeholders (browse = current only). At the top, a prominent **"Pin to track how this forecast evolves"** CTA → `/projects/new` (spec §1 key UX principle), and a `.btn` to pin.
- When `conditions` is null (never refreshed) → an "updating…" / "no current conditions yet" empty state (spec §4) — no crash.
- Browse must **not** render the FreezingLevelHero/Confidence/Model-Lab placeholders that the project detail shows (those are project-only).

**Vitest test specs:**
```tsx
// MountainCard.test.tsx
it("links to the slug page and shows summit elevation", () => {
  render(<MountainCard mountain={rainier} />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/mountains/mt-rainier");
  expect(screen.getByText(/14,410 ft/)).toBeInTheDocument();
});
// Mountains.test.tsx (mock useMountains)
it("renders a card per mountain", () => {
  vi.mocked(useMountains).mockReturnValue({ mountains: [rainier, baker], isLoading:false } as any);
  render(<Mountains />);
  expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2);
});
// MountainDetail.test.tsx (mock useMountain + useWeather etc.)
it("shows the Pin CTA and calm panels, but NOT confidence/model-lab", () => {
  render(<MountainDetail slug="mt-rainier" />);
  expect(screen.getByRole("link", { name: /pin to track/i })).toHaveAttribute("href", "/projects/new");
  expect(screen.queryByTestId("confidence-placeholder")).toBeNull();
  expect(screen.queryByRole("link", { name: /model lab/i })).toBeNull();
});
it("shows empty state when conditions are null", () => {
  vi.mocked(useMountain).mockReturnValue({ data: { mountain: rainier, conditions: null } } as any);
  render(<MountainDetail slug="mt-rainier" />);
  expect(screen.getByText(/no current conditions|updating/i)).toBeInTheDocument();
});
```

**Playwright spec** (`tests/e2e/mountains.spec.ts`, desktop + mobile):
```ts
test("browse list and detail", async ({ page }, ti) => {
  await page.goto("/mountains");
  await expect(page.getByRole("heading", { name: /peaks/i })).toBeVisible();
  await page.screenshot({ path: ti.outputPath("mountains-list.png"), fullPage: true });
  await page.locator(".proj-card a, a.proj-card").first().click();
  await expect(page.getByRole("link", { name: /pin to track/i })).toBeVisible();
  await page.screenshot({ path: ti.outputPath("mountain-detail.png"), fullPage: true });
});
```

- [ ] Step 1: Write the three test files → **FAIL**.
- [ ] Step 2: Implement `MountainCard`, `Mountains`, `MountainDetail` (reusing calm panels, omitting Confidence/Evolution/Model Lab, adding the Pin CTA), and both routes.
- [ ] Step 3: Run unit suite → **PASS**. Run `mountains.spec.ts` → **PASS**, screenshots saved.
- [ ] Step 4: Commit — `git commit -m "feat(p4): mountains browse list + slug detail (calm panels minus drill-down, Pin CTA)"`

---

## Task 15: Verification gate (build, coverage, e2e, visual + ux review)

- [ ] **Step 1: Type + build** — Run `npm run build`. Expected: "Compiled successfully", no TS/ESLint errors, all routes listed (`/`, `/projects/new`, `/projects/[id]`, `/mountains`, `/mountains/[slug]`).
- [ ] **Step 2: Coverage** — Run `npm run test:coverage`. Expected: all suites pass; coverage over `components/**` + `lib/units.ts` + `lib/derive.ts` + `lib/hooks.ts` meets **lines ≥90, functions ≥90, branches ≥85**. If under, add tests for uncovered branches (pending states, no-rating, summer, null data, `{k:true}`/`withUnit:false` paths).
- [ ] **Step 3: E2E (desktop + mobile)** — Ensure the emulator is seeded (`firebase emulators:exec --only firestore,pubsub "FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed:emulator"`), then run `npm run test:e2e`. Expected: every spec passes on **both** Playwright projects; screenshots present under `test-results/`: `dashboard-populated`, `dashboard-slate`, `dashboard-empty`, `create`, `outlook-daily/period/hourly`, `avalanche`, `snowpack`, `satellite-notes`, `detail-full`, `mountains-list`, `mountain-detail` (×2 viewports).
- [ ] **Step 4: Visual comparison** — Open each screenshot and compare side-by-side with the corresponding Cirque screen (`prototype-ui/.../app/*.jsx` rendered + `DESIGN §13`). Confirm: tokens/typography match; tone/danger/precip use icon+word+meter (never color-only); Daily Outlook ribbon aligns over tile centers; both themes re-skin fully; ≤900 and ≤680 layouts behave per `styles.css`.
- [ ] **Step 5: UX review** — Invoke the `ux-reviewer` agent on the P4 components (loading/error/empty states, accessibility, mobile responsiveness, chart readability, alpine design consistency). Address blocking findings; log non-blocking ones for P6.
- [ ] **Step 6: Confirm exit criteria** — tick each box in the header Exit criteria; note deviations in the PR.
- [ ] **Step 7: Final commit** — `git add -A && git commit -m "chore(p4): dashboard + create + calm-layer detail UI complete (units, themes, screenshots)"`

---

## Verification gate (P4 done when all true)
- `npm run build` ✓ clean.
- `npm run test:coverage` ✓ ≥90/90/85 over components + units/derive/hooks.
- `npm run test:e2e` ✓ green desktop + mobile; all screenshots saved + visually matched to Cirque.
- Theme toggle re-skins via `[data-theme]`; units toggle converts every measured display + chart axis and persists (`cirque.units`). ✓
- IA order matches contract §0; FreezingLevelHero + ConfidenceStrip are clearly-marked P5 placeholders on project detail; browse omits Confidence/Evolution/Model Lab. ✓
- A11y: danger number+label+meter, tone dot+word, precip icon+text, `role=tablist` segmenteds, labeled units `role=group`, `aria-label` icon buttons. ✓
- `ux-reviewer` run, no blocking findings. ✓

## Rollback / notes
- Pure-UI phase: no infra/Terraform changes; rollback = revert the branch. No deploy in P4 (app deploys at P0/P7 per spec §7).
- **Deferred to P5:** FreezingLevelHero (static SVG cross-section + DayStrip + band cards), ConfidenceStrip (live), Model Lab (`/projects/[id]/models`), ForecastEvolutionChart, HourlyGrid, the elevation selector wiring into the freezing hero. The two placeholders (`freezing-level-placeholder`, `confidence-placeholder`) mark their slots.
- **Deferred to P6:** full loading/error/empty polish, "updating…"/last-refreshed everywhere, <3-snapshot evolution state, attribution **footer** (P4 surfaces EOX attribution in the satellite panel only), `prefers-reduced-motion` audit, keyboard/focus + roving-focus on segmenteds/typeahead, side-by-side compare.
- **Open risks / assumptions:**
  - The combined blob exposes per-band temps (`temp_base_f/temp_mid_f/temp_summit_f`) per §9; if a band array is empty, DailyOutlook falls back to `temperature_2m` for the summit and disables Base/Mid (label "not available").
  - `currentSummary` carries `tone` + `verdict` (computed server-side, contract §0/§6) — the UI **renders** them, it does not recompute tone client-side (the prototype's `summarize`/`buildVerdict` logic now lives in the worker, P1).
  - SNOTEL **snow depth** follows the height axis as in⇄cm (spec §12a says the height axis governs SNOTEL snow depth; precip/snowfall + SWE stay inches in the POC).
  - Satellite data source for the panel: the project/mountain payload must include the `satelliteCache` doc (or a `/api/.../satellite` endpoint). Contract §7 lists nwac/snotel/weather endpoints but **no explicit project satellite endpoint** — see Gaps below. P4 takes `SatelliteCache` as a prop; the parent supplies it however P3 exposes it.
  - `bandNames` (Paradise/Camp Muir/…) are prototype flavor not in the real `Mountain` type — DailyOutlook uses generic "Base/Mid/Summit + elevation" when `bandNames` is absent.
