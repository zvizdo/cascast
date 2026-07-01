# Home Page Redesign — Search + Browse-by-Region — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/` home page as an "explain, then browse" landing — an editorial hero that makes the Washington & Oregon / free-open-data story obvious, the existing search reframed as a fast path, and a region-grouped browse grid of every catalog peak.

**Architecture:** A thin client `page.tsx` composes three pieces: a hero (kicker/title/sub + a theme-aware ridge SVG + the unchanged `MountainSearch`), a three-cell feature strip, and a new `<MountainBrowse>` fed by a new pure `regions.ts` helper that partitions the bundled `MOUNTAINS` constant into WA / Oregon / Beyond groups (summit-desc sorted). No network, API, pipeline, or Terraform changes — all data is the bundled catalog constant.

**Tech Stack:** Next.js 16 App Router (client component), React, Zustand (`useUnits`), SWR (`useMountains`), Vitest + Testing Library, Playwright, hand-written CSS in `globals.css` using Cirque design tokens.

**Spec:** `docs/superpowers/specs/2026-06-30-home-page-redesign-design.md`
**Approved visual reference:** `.superpowers/brainstorm/59874-1782876689/content/home-layout.html`

## Global Constraints

*Every task's requirements implicitly include this section.*

- **Design system:** Adhere to `docs/prototype-ui/prototype-design-review/project/DESIGN.md` (Cirque — calm, editorial, cool-alpine). Anti-goals: gradient soup, decorative emoji, neon, faux-3D glyphs, data slop. **Every subagent working a task MUST (a) read `docs/prototype-ui/prototype-design-review/project/DESIGN.md` and (b) invoke the `frontend-design:frontend-design` skill** before writing UI code.
- **Tokens only, never literals:** All CSS colors reference `var(--token)` (DESIGN §6 — theming must be total across Glacier + Slate). Any new color needs an entry in **both** `:root` and `[data-theme="slate"]` in `src/app/globals.css`. No raw hex in component styles.
- **Do not modify** `src/components/create/MountainSearch.tsx` — reuse it as-is.
- **No backend changes:** no `src/app/api/**`, no Firestore, no Python functions, no Terraform. Data comes from the bundled `MOUNTAINS` constant (`src/lib/mountains-data.ts`).
- **Scope:** the `/` home route only. Do **not** touch the `your-mountains` page or its "Washington Cascades" kicker.
- **Sort:** within every region subgroup, peaks are sorted by `elevations.summit` **descending**.
- **Card link target:** `/mountains/${slug}`. **Elevation display:** unit-aware via `fmtDist(m.elevations.summit, dist)` where `dist = useUnits((s) => s.dist)`.
- **TDD:** failing test first, then implement. **Coverage floors** (hard): 90% lines / 90% functions / 85% branches (`config/vitest.config.ts`).
- **Test commands** (per repo convention — the vitest config lives at `config/vitest.config.ts`):
  - Unit (one file): `npm test -- --run <path>`
  - Full unit gate: `npm test`
  - Build: `npm run build`
  - E2E: `npm run test:e2e` (Playwright config runs desktop 1280×800 + mobile iPhone 12; a single spec runs under both).
- **Commit** after each task.

---

### Task 1: `regions.ts` — region display model (pure)

**Files:**
- Create: `src/lib/regions.ts`
- Test: `src/lib/__tests__/regions.test.ts`

**Interfaces:**
- Consumes: `MOUNTAINS` from `@/lib/mountains-data`, `Mountain` from `@/lib/types`.
- Produces:
  - `interface RegionSubgroup { label: string | null; mountains: Mountain[] }`
  - `interface RegionGroup { id: "washington" | "oregon" | "beyond"; title: string; note: string; subgroups: RegionSubgroup[] }`
  - `function browseGroups(mountains?: readonly Mountain[]): RegionGroup[]` — groups in fixed WA→Oregon→Beyond order; subgroups ordered by a fixed sub-order; each subgroup's `mountains` sorted by summit desc; empty groups/subgroups omitted; an unknown region string falls into Beyond under "Other peaks" (never dropped).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/regions.test.ts
import { describe, it, expect } from "vitest";
import { browseGroups } from "@/lib/regions";
import { MOUNTAINS } from "@/lib/mountains-data";
import type { Mountain } from "@/lib/types";

describe("browseGroups", () => {
  it("returns the three top-level groups in WA → Oregon → Beyond order", () => {
    const g = browseGroups();
    expect(g.map((x) => x.id)).toEqual(["washington", "oregon", "beyond"]);
    expect(g[0].title).toBe("Washington");
    expect(g[2].title).toBe("Beyond the Northwest");
  });

  it("Washington has the four sub-labels in order", () => {
    const wa = browseGroups().find((x) => x.id === "washington")!;
    expect(wa.subgroups.map((s) => s.label)).toEqual([
      "North Cascades",
      "Central Cascades · Enchantments",
      "South Cascades",
      "Olympics",
    ]);
  });

  it("sorts peaks within a subgroup by summit elevation, descending", () => {
    const wa = browseGroups().find((x) => x.id === "washington")!;
    const south = wa.subgroups.find((s) => s.label === "South Cascades")!;
    const elevs = south.mountains.map((m) => m.elevations.summit);
    expect(elevs[0]).toBe(Math.max(...elevs)); // Rainier (14,410) leads
    expect([...elevs]).toEqual([...elevs].sort((a, b) => b - a));
  });

  it("Oregon is a single unlabelled subgroup led by Mount Hood", () => {
    const or = browseGroups().find((x) => x.id === "oregon")!;
    expect(or.subgroups).toHaveLength(1);
    expect(or.subgroups[0].label).toBeNull();
    expect(or.subgroups[0].mountains[0].name).toBe("Mount Hood");
  });

  it("Beyond contains Mount Whitney", () => {
    const b = browseGroups().find((x) => x.id === "beyond")!;
    const names = b.subgroups.flatMap((s) => s.mountains.map((m) => m.name));
    expect(names).toContain("Mount Whitney");
  });

  it("places an unknown region in Beyond under 'Other peaks' rather than dropping it", () => {
    const odd = { ...MOUNTAINS[0], slug: "test-odd", name: "Test Odd", region: "mars" } as Mountain;
    const b = browseGroups([...MOUNTAINS, odd]).find((x) => x.id === "beyond")!;
    const other = b.subgroups.find((s) => s.label === "Other peaks");
    expect(other?.mountains.some((m) => m.slug === "test-odd")).toBe(true);
  });

  it("every catalog mountain appears exactly once", () => {
    const slugs = browseGroups().flatMap((g) => g.subgroups.flatMap((s) => s.mountains.map((m) => m.slug)));
    expect(new Set(slugs).size).toBe(MOUNTAINS.length);
    expect(slugs).toHaveLength(MOUNTAINS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/__tests__/regions.test.ts`
Expected: FAIL — cannot find module `@/lib/regions`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/regions.ts
import { MOUNTAINS } from "@/lib/mountains-data";
import type { Mountain } from "@/lib/types";

export interface RegionSubgroup {
  label: string | null;
  mountains: Mountain[];
}
export interface RegionGroup {
  id: "washington" | "oregon" | "beyond";
  title: string;
  note: string;
  subgroups: RegionSubgroup[];
}

type GroupId = RegionGroup["id"];
const GROUP_ORDER: GroupId[] = ["washington", "oregon", "beyond"];

const GROUP_META: Record<GroupId, { title: string; note: string }> = {
  washington: {
    title: "Washington",
    note: "The Cascades and Olympics — hourly weather, NWAC avalanche danger, and SNOTEL snowpack.",
  },
  oregon: {
    title: "Oregon",
    note: "Oregon's Cascade volcanoes. Weather and satellite everywhere; NWAC avalanche coverage thins south of Mount Hood.",
  },
  beyond: {
    title: "Beyond the Northwest",
    note: "Peaks outside NWAC's region — weather and satellite only (no avalanche or SNOTEL feed).",
  },
};

// region string → group + sub-label + intra-group order
const REGION_MAP: Record<string, { group: GroupId; subLabel: string | null; subOrder: number }> = {
  "cascades-north": { group: "washington", subLabel: "North Cascades", subOrder: 0 },
  "cascades-central": { group: "washington", subLabel: "Central Cascades · Enchantments", subOrder: 1 },
  "cascades-south": { group: "washington", subLabel: "South Cascades", subOrder: 2 },
  olympics: { group: "washington", subLabel: "Olympics", subOrder: 3 },
  oregon: { group: "oregon", subLabel: null, subOrder: 0 },
  "sierra-nevada": { group: "beyond", subLabel: null, subOrder: 0 },
};
const FALLBACK = { group: "beyond" as GroupId, subLabel: "Other peaks", subOrder: 99 };

export function browseGroups(mountains: readonly Mountain[] = MOUNTAINS): RegionGroup[] {
  const buckets = new Map<GroupId, Map<string, { label: string | null; order: number; mountains: Mountain[] }>>();
  for (const m of mountains) {
    const cfg = REGION_MAP[m.region] ?? FALLBACK;
    if (!buckets.has(cfg.group)) buckets.set(cfg.group, new Map());
    const subs = buckets.get(cfg.group)!;
    const key = cfg.subLabel ?? "__none__";
    if (!subs.has(key)) subs.set(key, { label: cfg.subLabel, order: cfg.subOrder, mountains: [] });
    subs.get(key)!.mountains.push(m);
  }
  const result: RegionGroup[] = [];
  for (const id of GROUP_ORDER) {
    const subs = buckets.get(id);
    if (!subs) continue;
    const subgroups: RegionSubgroup[] = [...subs.values()]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        label: s.label,
        mountains: [...s.mountains].sort((a, b) => b.elevations.summit - a.elevations.summit),
      }));
    result.push({ id, title: GROUP_META[id].title, note: GROUP_META[id].note, subgroups });
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/__tests__/regions.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regions.ts src/lib/__tests__/regions.test.ts
git commit -m "feat(home): region display model for browse-by-region"
```

---

### Task 2: `MountainBrowse` component + card

**Files:**
- Create: `src/components/home/MountainBrowse.tsx`
- Test: `src/components/home/__tests__/MountainBrowse.test.tsx`

**Interfaces:**
- Consumes: `browseGroups` from `@/lib/regions`; `useUnits`, `fmtDist` from `@/lib/units`; `Mountain` from `@/lib/types`.
- Produces: `export function MountainBrowse({ mountains }: { mountains: Mountain[] }): JSX.Element`. Renders one `<section className="region" aria-labelledby>` per group with an `<h2 className="region-title">`, a `<p className="region-note">`, optional `.sub-label`s, and a `.mtn-grid` of `<Link className="mtn-card">` cards (name, unit-aware summit elevation, 2-line description).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/home/__tests__/MountainBrowse.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MountainBrowse } from "@/components/home/MountainBrowse";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { Mountain } from "@/lib/types";

const base: Omit<Mountain, "slug" | "name" | "elevations" | "region"> = {
  lat: 46.85, lng: -121.76, nwacZone: "z", nwacZoneId: "1", snotelStationId: "1",
  snotelStationTriplet: "1:WA:SNTL", snotelStationName: "S", timezone: "America/Los_Angeles",
  description: "A test peak descriptor.",
};
const M = (slug: string, name: string, region: string, summit: number): Mountain =>
  ({ ...base, slug, name, region, elevations: { base: 1000, mid: 5000, summit } } as Mountain);

const mts: Mountain[] = [
  M("mt-rainier", "Mount Rainier", "cascades-south", 14410),
  M("mt-baker", "Mount Baker", "cascades-north", 10781),
  M("mt-stuart", "Mount Stuart", "cascades-central", 9415),
  M("mt-olympus", "Mount Olympus", "olympics", 7980),
  M("mt-hood", "Mount Hood", "oregon", 11249),
  M("mt-whitney", "Mount Whitney", "sierra-nevada", 14505),
];

beforeEach(() => useUnits.setState(DEFAULT_UNITS));

describe("MountainBrowse", () => {
  it("renders the three region headings", () => {
    render(<MountainBrowse mountains={mts} />);
    expect(screen.getByRole("heading", { name: "Washington" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Oregon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beyond the Northwest" })).toBeInTheDocument();
  });

  it("renders the four Washington sub-labels", () => {
    render(<MountainBrowse mountains={mts} />);
    for (const label of ["North Cascades", "Central Cascades · Enchantments", "South Cascades", "Olympics"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders a card linking to the peak with its summit elevation in feet", () => {
    render(<MountainBrowse mountains={mts} />);
    const link = screen.getByRole("link", { name: /Mount Rainier/i });
    expect(link).toHaveAttribute("href", "/mountains/mt-rainier");
    expect(screen.getByText(/14,410 ft/)).toBeInTheDocument();
  });

  it("respects the units toggle (feet → meters)", () => {
    useUnits.setState({ dist: "m" });
    render(<MountainBrowse mountains={mts} />);
    expect(screen.getByText(/4,392 m/)).toBeInTheDocument(); // 14410 ft → 4392 m
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/home/__tests__/MountainBrowse.test.tsx`
Expected: FAIL — cannot find module `@/components/home/MountainBrowse`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/home/MountainBrowse.tsx
"use client";
import Link from "next/link";
import { browseGroups } from "@/lib/regions";
import { useUnits, fmtDist, type DistUnit } from "@/lib/units";
import type { Mountain } from "@/lib/types";

export function MountainBrowse({ mountains }: { mountains: Mountain[] }) {
  const dist = useUnits((s) => s.dist);
  const groups = browseGroups(mountains);
  return (
    <div className="browse">
      {groups.map((g) => (
        <section key={g.id} className="region" aria-labelledby={`region-${g.id}`}>
          <h2 id={`region-${g.id}`} className="region-title">{g.title}</h2>
          <p className="region-note">{g.note}</p>
          {g.subgroups.map((s, i) => (
            <div className="region-sub" key={s.label ?? `sub-${i}`}>
              {s.label && <div className="sub-label">{s.label}</div>}
              <div className="mtn-grid">
                {s.mountains.map((m) => (
                  <MountainCard key={m.slug} m={m} dist={dist} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function MountainCard({ m, dist }: { m: Mountain; dist: DistUnit }) {
  return (
    <Link href={`/mountains/${m.slug}`} className="mtn-card">
      <div className="mtn-name">{m.name}</div>
      <div className="mtn-elev">
        {fmtDist(m.elevations.summit, dist)} <span className="mtn-elev-tag">summit</span>
      </div>
      <div className="mtn-desc">{m.description}</div>
    </Link>
  );
}
```

> Note: `fmtDist` returns the value **with** its unit (e.g. `"14,410 ft"`), so do not append `ft`/`m` yourself. `DistUnit` is already exported from `@/lib/units` (`export type DistUnit = "ft" | "m"`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/home/__tests__/MountainBrowse.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/MountainBrowse.tsx src/components/home/__tests__/MountainBrowse.test.tsx
git commit -m "feat(home): MountainBrowse region grid component"
```

---

### Task 3: `HeroRidge` + `page.tsx` rewrite

**Files:**
- Create: `src/components/home/HeroRidge.tsx`
- Modify: `src/app/page.tsx` (full rewrite of the returned JSX)
- Modify: `src/app/__tests__/home.test.tsx` (extend existing suite)

**Interfaces:**
- Consumes: `MountainSearch` (`@/components/create/MountainSearch`), `MountainBrowse` (Task 2), `HeroRidge` (this task), `useMountains` (`@/lib/hooks`), `useRouter` (`next/navigation`).
- Produces: default-export `Home` client component; `export function HeroRidge(): JSX.Element` (decorative `aria-hidden` SVG with three `<path>`s classed `ridge-far` / `ridge-near` / `ridge-snow`).

- [ ] **Step 1: Write the failing test** (append these to the existing `describe` blocks in `src/app/__tests__/home.test.tsx`; keep all existing tests unchanged)

```tsx
// add near the other imports if not present:
// (useMountains/useRouter/useUnits already mocked/set in this file's beforeEach)

describe("Home (explain + browse)", () => {
  it("renders the hero kicker and title", () => {
    render(<Home />);
    expect(screen.getByText(/free alpine weather/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /pacific northwest/i })).toBeInTheDocument();
  });

  it("links the Data feature to the sources page", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /free, public sources/i })).toHaveAttribute("href", "/sources");
  });

  it("renders the browse-by-region section from the catalog", () => {
    render(<Home />);
    // mts fixture (Rainier + Baker) → Washington group present with a Rainier card
    expect(screen.getByRole("heading", { name: "Washington" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mount Rainier/i })).toHaveAttribute("href", "/mountains/mt-rainier");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/__tests__/home.test.tsx`
Expected: FAIL — new assertions (kicker/title/feature link/region heading) not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/home/HeroRidge.tsx
export function HeroRidge() {
  return (
    <svg className="hero-ridge" viewBox="0 0 1180 230" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path
        className="ridge-far"
        d="M0 230 L0 150 L140 92 L250 140 L360 70 L470 130 L560 96 L680 150 L790 60 L900 128 L1010 92 L1120 150 L1180 118 L1180 230 Z"
      />
      <path
        className="ridge-near"
        d="M0 230 L0 178 L120 140 L240 176 L360 120 L500 170 L620 138 L760 182 L880 128 L1010 172 L1120 150 L1180 176 L1180 230 Z"
      />
      <path className="ridge-snow" d="M360 70 l-30 42 l60 0 Z M790 60 l-34 46 l68 0 Z" />
    </svg>
  );
}
```

```tsx
// src/app/page.tsx  (replace the whole file)
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MountainSearch } from "@/components/create/MountainSearch";
import { MountainBrowse } from "@/components/home/MountainBrowse";
import { HeroRidge } from "@/components/home/HeroRidge";
import { useMountains } from "@/lib/hooks";
import type { Mountain } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { mountains } = useMountains();
  const onSelect = (m: Mountain) => router.push(`/mountains/${m.slug}`);

  return (
    <div className="page home">
      <section className="hero">
        <HeroRidge />
        <div className="hero-body">
          <div className="kicker">Free alpine weather · Washington &amp; Oregon</div>
          <h1 className="page-title hero-title">
            Mountain weather for the <em>Pacific Northwest</em>
          </h1>
          <p className="page-sub hero-sub">
            A single, honest read on the Cascades, Olympics, and Oregon volcanoes — freezing level,
            wind, avalanche danger, and snowpack for every major alpine peak. Built entirely on free,
            public data.
          </p>
          <div className="hero-search">
            <MountainSearch
              mountains={mountains ?? []}
              value={null}
              onSelect={onSelect}
              onClear={() => {}}
              minQueryLength={3}
            />
          </div>
          <p className="hero-hint">Know the peak? Jump straight to it — or browse by region below.</p>
          <div className="feat-strip">
            <div className="feat">
              <span className="feat-k">Coverage</span>
              <span className="feat-v">Washington &amp; Oregon alpine peaks</span>
            </div>
            <Link className="feat feat-link" href="/sources">
              <span className="feat-k">Data</span>
              <span className="feat-v">
                Free, public sources <span aria-hidden="true">→</span>
              </span>
            </Link>
            <div className="feat">
              <span className="feat-k">Forecast</span>
              <span className="feat-v">Multiple weather models, blended</span>
            </div>
          </div>
        </div>
      </section>

      <MountainBrowse mountains={mountains ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/__tests__/home.test.tsx`
Expected: PASS — existing search tests **and** the three new tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/HeroRidge.tsx src/app/page.tsx src/app/__tests__/home.test.tsx
git commit -m "feat(home): explain+browse hero, feature strip, browse section"
```

---

### Task 4: Styles + theme-aware ridge tokens (`globals.css`)

**Files:**
- Modify: `src/app/globals.css` (add ridge tokens to `:root` and `[data-theme="slate"]`; append a home-page style block)

**Interfaces:**
- Consumes: existing tokens (`--surface`, `--line`, `--ink`, `--muted`, `--accent`, `--accent-soft`, `--serif`, `--mono`, `--sans`, `--radius`, `--shadow-sm`, `--shadow`, etc.) and the classNames emitted by Tasks 2–3.
- Produces: new tokens `--hero-ridge-far`, `--hero-ridge-near`, `--hero-ridge-snow` (both themes); visual styling for `.home .hero`, `.hero-ridge`, `.feat-strip`, `.region`, `.mtn-card`, and their responsive behavior.

There is no unit test for CSS; this task is verified by `npm run build` + a visual check (Step 3) and locked in by the Task 5 e2e.

- [ ] **Step 1: Add ridge tokens to both themes**

In `src/app/globals.css`, inside the `:root { … }` block (near the `--sky-*` tokens) add:

```css
  --hero-ridge-far: #dbe6ef;
  --hero-ridge-near: #cfdde9;
  --hero-ridge-snow: #eef5fa;
```

Inside the `[data-theme="slate"] { … }` block (near its `--sky-*` overrides) add:

```css
  --hero-ridge-far: #16222e;
  --hero-ridge-near: #1b2a37;
  --hero-ridge-snow: #24384a;
```

- [ ] **Step 2: Append the home style block** at the end of `src/app/globals.css`

```css
/* ---------- Home (explain + browse) ---------- */
.home .hero { position: relative; overflow: hidden; margin-bottom: 8px; padding-bottom: 26px; }
.hero-ridge { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 210px; z-index: 0; pointer-events: none; }
.hero-ridge .ridge-far { fill: var(--hero-ridge-far); }
.hero-ridge .ridge-near { fill: var(--hero-ridge-near); }
.hero-ridge .ridge-snow { fill: var(--hero-ridge-snow); }
.hero-body { position: relative; z-index: 1; }
.hero-title { max-width: 15ch; }
.hero-title em { font-style: italic; color: var(--ink-2); }
.hero-sub { margin-top: 16px; }
.hero-search { margin-top: 24px; max-width: 560px; }
.hero-hint { margin-top: 10px; font-size: 12.5px; color: var(--muted); }

.feat-strip {
  margin-top: 26px; display: grid; grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
  box-shadow: var(--shadow-sm); overflow: hidden;
}
.feat { padding: 15px 20px; display: flex; flex-direction: column; gap: 5px; border-left: 1px solid var(--line); text-decoration: none; color: inherit; }
.feat:first-child { border-left: none; }
.feat-k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.feat-v { font-size: 15px; font-weight: 600; color: var(--ink); }
.feat-link:hover .feat-v { color: var(--accent); }

.browse { margin-top: 28px; }
.region { margin-bottom: 40px; }
.region-title { font-family: var(--serif); font-weight: 500; font-size: 27px; letter-spacing: -0.01em; margin: 0; }
.region-note { font-size: 13.5px; color: var(--muted); margin: 4px 0 18px; max-width: 62ch; }
.sub-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--muted); margin: 22px 0 12px; display: flex; align-items: center; gap: 12px; }
.sub-label::after { content: ""; flex: 1; height: 1px; background: var(--line); }

.mtn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 14px; }
.mtn-card {
  display: flex; flex-direction: column; gap: 8px; min-height: 118px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px 17px 15px; box-shadow: var(--shadow-sm); text-decoration: none; color: inherit;
  transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
}
.mtn-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: var(--line-strong); }
.mtn-name { font-family: var(--serif); font-size: 18px; font-weight: 500; line-height: 1.15; letter-spacing: -0.01em; }
.mtn-elev { font-family: var(--mono); font-size: 12.5px; font-weight: 500; color: var(--accent); }
.mtn-elev-tag { color: var(--muted); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; margin-left: 4px; }
.mtn-desc { font-size: 12.5px; line-height: 1.42; color: var(--muted); margin-top: auto; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

@media (max-width: 900px) {
  .feat-strip { grid-template-columns: 1fr; }
  .feat { border-left: none; border-top: 1px solid var(--line); }
  .feat:first-child { border-top: none; }
}
@media (max-width: 680px) {
  .region-title { font-size: 23px; }
  .mtn-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
```

> Follow DESIGN §16: keep hit targets ≥44px and body/data type floors. Do not introduce raw hex outside the two token blocks above.

- [ ] **Step 3: Verify build + visual parity** (both themes, both viewports)

Run: `npm run build`
Expected: build succeeds (no type/lint errors).

Then capture screenshots for the reviewer in Task 6 (the app must be running — `npm run start` after build, or `npm run dev`): load `/`, toggle Glacier↔Slate and desktop↔mobile, confirm: ridge sits behind the hero text (text fully legible in both themes), feature strip reads as one unit and stacks ≤900px, region grids reflow, cards lift on hover. Save comparison shots under the gitignored `qa-screenshots/`.

- [ ] **Step 4: Run the full unit gate** (ensure coverage floors hold)

Run: `npm test`
Expected: PASS; coverage ≥ 90/90/85.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(home): Cirque styling for hero, feature strip, browse grid (both themes)"
```

---

### Task 5: E2E — home page (desktop + mobile)

**Files:**
- Create: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `maybeInstallMocks` from `./_mock`. Note: the `/api/mountains` **list** route is served by the local Playwright `webServer` from the bundled catalog constant (P15), so the browse grid populates without a backend; the mock only covers `/api/mountains/**` sub-paths.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/home.spec.ts
import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("home shows the pitch, feature strip, and browse-by-region", async ({ page }, ti) => {
  await page.goto("/");

  // hero pitch
  await expect(page.getByText(/free alpine weather/i)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /pacific northwest/i })).toBeVisible();
  // feature strip → sources
  await expect(page.getByRole("link", { name: /free, public sources/i })).toHaveAttribute("href", "/sources");
  // region groupings
  await expect(page.getByRole("heading", { name: "Washington" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oregon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beyond the Northwest" })).toBeVisible();

  await page.screenshot({ path: `qa-screenshots/home-${ti.project.name}.png`, fullPage: true });
});

test("clicking a browse card opens the peak's focused view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Mount Rainier/i }).first().click();
  await expect(page).toHaveURL(/\/mountains\/mt-rainier/);
});

test("search still routes to a peak", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("combobox", { name: /search mountains/i });
  await input.fill("shuk");
  await page.getByRole("option", { name: /Mount Shuksan/i }).click();
  await expect(page).toHaveURL(/\/mountains\/mt-shuksan/);
});
```

- [ ] **Step 2: Run test to verify it fails/passes appropriately**

Run: `npm run test:e2e -- home.spec.ts`
Expected: FAIL first if run before Tasks 3–4 landed; after them, PASS in **both** the desktop and mobile projects.

- [ ] **Step 3: Make it pass** — no new product code should be needed; if a selector misses, adjust the spec to match the shipped markup (not the other way around, unless the markup is wrong).

- [ ] **Step 4: Full gates green**

Run: `npm run build && npm test && npm run test:e2e`
Expected: all PASS; coverage floors held.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/home.spec.ts
git commit -m "test(home): e2e for pitch, browse-by-region, and search nav"
```

---

### Task 6: UI/UX polish critique loop (reviewer ↔ implementer, ≥2 rounds)

**This is the final QA and is solely about UI/UX polish** — visual hierarchy, spacing rhythm, typography, Cirque fidelity (both themes), hover/focus states, responsive behavior (desktop + mobile), and accessibility contrast. **No functional or scope changes** (no new features, no data, no API). All gates must stay green after every implementer pass.

**Files:** whatever the polish requires among `src/app/page.tsx`, `src/components/home/*`, `src/app/globals.css`. No new backend files.

- [ ] **Step 1: Prepare fresh screenshots**

Ensure the app is running the built home page, then capture `/` in **all four** combinations — {Glacier, Slate} × {desktop 1280×800, mobile iPhone 12} — into `qa-screenshots/` (reuse the Task 5 spec or a quick Playwright script). These are the reviewer's evidence.

- [ ] **Step 2: Round 1 — Reviewer critique**

Dispatch a `ux-reviewer` subagent. Its prompt MUST instruct it to:
- Read `docs/prototype-ui/prototype-design-review/project/DESIGN.md` and invoke the `frontend-design:frontend-design` skill.
- Review **only** the home page (`/`) against the approved mockup `.superpowers/brainstorm/59874-1782876689/content/home-layout.html` and DESIGN.md, using the four screenshots.
- Judge **UI/UX polish only**: hero hierarchy & the ridge's tastefulness/legibility, feature-strip balance, region rhythm & note clarity, card density/typography/hover, sub-label treatment, both-theme fidelity, mobile stacking, focus-visible rings, and AA contrast.
- Return a **prioritized** list: `BLOCKER` (breaks Cirque fidelity or usability) vs `NIT` (refinement), each with a concrete, actionable fix. End with a verdict: `APPROVE` or `REVISE`.

- [ ] **Step 3: Round 1 — Implementer applies fixes**

Dispatch a fresh implementer subagent (also required to read DESIGN.md + invoke `frontend-design`). It applies the reviewer's BLOCKERs and reasonable NITs — polish only, tokens-only CSS, no scope creep — then runs `npm run build && npm test && npm run test:e2e` and confirms all green (coverage floors held). Commit:

```bash
git commit -am "polish(home): UX review round 1 fixes"
```

- [ ] **Step 4: Round 2 — Re-screenshot, re-review, re-fix**

Repeat Steps 1–3 (fresh screenshots → `ux-reviewer` → implementer). Commit `polish(home): UX review round 2 fixes`.

- [ ] **Step 5: Continue until clean (min 2 rounds already done)**

If Round 2's reviewer still returns `REVISE` with BLOCKERs, run additional rounds (Steps 1–3) until the reviewer returns **APPROVE with zero BLOCKERs**. Do at least 2 rounds regardless; do more if needed. Each round keeps all gates green.

- [ ] **Step 6: Final verification + commit**

Run: `npm run build && npm test && npm run test:e2e`
Expected: all PASS; coverage ≥ 90/90/85; reviewer verdict APPROVE.

```bash
git commit -am "polish(home): final UX pass — reviewer APPROVE" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- Hero (kicker/title/sub + ridge + reused `MountainSearch`) → Task 3 + Task 4. ✅
- Feature strip (3 props, Data → `/sources`) → Task 3 + Task 4. ✅
- Browse WA/Oregon/Beyond, sub-labels, summit-desc sort, static cards, unit-aware elevation, card → `/mountains/[slug]` → Tasks 1, 2, 4. ✅
- `regions.ts` helper (pure, tested, unknown-region-safe) → Task 1. ✅
- `MountainBrowse` component → Task 2. ✅
- Copy cleanup (WA & Oregon; supersedes "Washington peak") → Task 3 (new hero sub replaces old copy). ✅
- No backend/nav/brand changes; your-mountains untouched → Global Constraints + scope notes. ✅
- Tests: regions unit, MountainBrowse render + units, page render, e2e desktop+mobile → Tasks 1, 2, 3, 5. ✅
- Final UI/UX critique loop (≥2 rounds, reviewer↔implementer, polish-only) → Task 6. ✅

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — every code step shows complete code. ✅

**Type consistency:** `browseGroups` / `RegionGroup` / `RegionSubgroup` used identically across Tasks 1–2; `MountainBrowse({ mountains })` prop matches Task 3's call site; `fmtDist(summit, dist)` + `useUnits((s) => s.dist)` consistent; ridge classNames (`ridge-far/near/snow`) match between Task 3 markup and Task 4 CSS; feature-strip and card classNames consistent between Tasks 3/2 and Task 4. ✅
