# Google Analytics (GA4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GA4 website + behavioral tracking (pageviews, dwell, return frequency, and high-value custom events) to the Mountain Weatherman web app.

**Architecture:** `@next/third-parties/google`'s `<GoogleAnalytics>` is rendered once in the root layout, gated on a server-only `GA_MEASUREMENT_ID` env var — it auto-fires SPA pageviews. A single typed helper `src/lib/analytics.ts` (`track` / `mountainParams` / `horizonDays`) wraps `sendGAEvent` and safely no-ops when GA isn't loaded. Tier-1 custom events are fired from existing client components; mountain dimensions are attached so GA4 reports can slice by mountain/region.

**Tech Stack:** Next 16.2.7 (App Router, React 19), `@next/third-parties`, SWR, Vitest + Testing Library, Terraform (Cloud Run `web` module).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-google-analytics-design.md` — the contract for this work.
- **No consent banner**, no GTM, no server-side/Measurement-Protocol events, no user-id.
- **Server-only env var `GA_MEASUREMENT_ID`** — NOT `NEXT_PUBLIC_*` (those inline at build time; we read it at runtime in a server component).
- **Coverage gate is hard: 90% lines / 90% functions / 85% branches.** TDD: failing test first, then implement. `src/lib/**` and `src/components/**` are covered (`src/components/three/**` is the only exclusion).
- Test runner: `npx vitest run --config config/vitest.config.ts <path>` (full suite: `npm test`).
- Match existing code style. Surgical changes only — every changed line traces to this plan.
- Secrets/PII never committed: the GA measurement ID is supplied via `TF_VAR_ga_measurement_id` (same pattern as `TF_VAR_alert_email`).

---

### Task 1: Install `@next/third-parties` + gated `<Analytics>` in root layout

**Files:**
- Modify: `package.json` (add `@next/third-parties` dependency — via npm, do not hand-edit)
- Create: `src/components/analytics/Analytics.tsx`
- Test: `src/components/analytics/__tests__/Analytics.test.tsx`
- Modify: `src/app/layout.tsx` (render `<Analytics />` in `<body>`)

**Interfaces:**
- Produces: `Analytics` — a server component (no `"use client"`) that reads `process.env.GA_MEASUREMENT_ID` and renders `<GoogleAnalytics gaId={...} />` when set, else `null`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @next/third-parties@latest`
Expected: `package.json` gains `"@next/third-parties"` under `dependencies`; `package-lock.json` updates; install succeeds.

- [ ] **Step 2: Write the failing test**

Create `src/components/analytics/__tests__/Analytics.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Render a marker instead of the real gtag <Script> so we can assert presence.
vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => <div data-testid="ga" data-ga-id={gaId} />,
}));

import { Analytics } from "../Analytics";

describe("Analytics", () => {
  const original = process.env.GA_MEASUREMENT_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.GA_MEASUREMENT_ID;
    else process.env.GA_MEASUREMENT_ID = original;
  });

  it("renders GoogleAnalytics with the id when GA_MEASUREMENT_ID is set", () => {
    process.env.GA_MEASUREMENT_ID = "G-TEST123";
    const { getByTestId } = render(<Analytics />);
    expect(getByTestId("ga").getAttribute("data-ga-id")).toBe("G-TEST123");
  });

  it("renders nothing when GA_MEASUREMENT_ID is unset", () => {
    delete process.env.GA_MEASUREMENT_ID;
    const { container } = render(<Analytics />);
    expect(container.querySelector('[data-testid="ga"]')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/components/analytics/__tests__/Analytics.test.tsx`
Expected: FAIL — cannot resolve `../Analytics`.

- [ ] **Step 4: Implement `Analytics.tsx`**

Create `src/components/analytics/Analytics.tsx`:

```tsx
/* Analytics — gated GA4 loader. Server component: reads the runtime-only
   GA_MEASUREMENT_ID (NOT NEXT_PUBLIC_*, which would inline at build time) and
   mounts GoogleAnalytics, which injects gtag.js and auto-fires SPA pageviews.
   Renders nothing when the id is absent (local dev / tests). */
import { GoogleAnalytics } from "@next/third-parties/google";

export function Analytics() {
  const gaId = process.env.GA_MEASUREMENT_ID;
  if (!gaId) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/components/analytics/__tests__/Analytics.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire into the root layout**

In `src/app/layout.tsx`, add the import after the existing component imports (around line 6):

```tsx
import { Analytics } from "@/components/analytics/Analytics";
```

Then render it inside `<body>`, immediately after `<Footer />` (line 60):

```tsx
        <Header />
        <ErrorBoundary>{children}</ErrorBoundary>
        <Footer />
        <Analytics />
```

- [ ] **Step 7: Verify build + lint clean**

Run: `npm run build`
Expected: builds successfully (no type errors; `GA_MEASUREMENT_ID` unset in build env → `<Analytics />` renders null, which is fine).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/analytics/ src/app/layout.tsx
git commit -m "feat(analytics): gated GA4 loader in root layout"
```

---

### Task 2: `src/lib/analytics.ts` tracking helper

**Files:**
- Create: `src/lib/analytics.ts`
- Test: `src/lib/__tests__/analytics.test.ts`

**Interfaces:**
- Consumes: `sendGAEvent` from `@next/third-parties/google` (installed in Task 1).
- Produces:
  - `type AnalyticsEvent` — string-union of the Tier-1 event names.
  - `track(event: AnalyticsEvent, params?: Record<string, string | number>): void` — no-ops when `window.gtag` is absent (SSR / GA not loaded); otherwise `sendGAEvent("event", event, params)`.
  - `mountainParams(m: { slug: string; name: string; region: string }): { mountain_slug: string; mountain_name: string; region: string }`.
  - `horizonDays(targetDate: string): number` — whole days from local midnight today to a `YYYY-MM-DD` target, floored at 0.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/analytics.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendGAEvent = vi.fn();
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...a: unknown[]) => sendGAEvent(...a) }));

import { track, mountainParams, horizonDays } from "../analytics";

describe("analytics", () => {
  beforeEach(() => {
    sendGAEvent.mockClear();
    delete (window as unknown as { gtag?: unknown }).gtag;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { gtag?: unknown }).gtag;
  });

  describe("track", () => {
    it("no-ops when window.gtag is absent", () => {
      track("pin_added", { mountain_slug: "rainier" });
      expect(sendGAEvent).not.toHaveBeenCalled();
    });

    it("calls sendGAEvent with the event name and params when gtag is present", () => {
      (window as unknown as { gtag: () => void }).gtag = () => {};
      track("pin_added", { mountain_slug: "rainier", target_horizon_days: 2 });
      expect(sendGAEvent).toHaveBeenCalledWith("event", "pin_added", {
        mountain_slug: "rainier",
        target_horizon_days: 2,
      });
    });

    it("defaults params to an empty object", () => {
      (window as unknown as { gtag: () => void }).gtag = () => {};
      track("explore_3d_opened");
      expect(sendGAEvent).toHaveBeenCalledWith("event", "explore_3d_opened", {});
    });
  });

  describe("mountainParams", () => {
    it("maps slug/name/region to GA param names", () => {
      expect(mountainParams({ slug: "mt-baker", name: "Mount Baker", region: "north-cascades" })).toEqual({
        mountain_slug: "mt-baker",
        mountain_name: "Mount Baker",
        region: "north-cascades",
      });
    });
  });

  describe("horizonDays", () => {
    it("returns whole days from today to the target", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 20, 9, 30)); // 2026-06-20 local
      expect(horizonDays("2026-06-22")).toBe(2);
      expect(horizonDays("2026-06-20")).toBe(0);
    });

    it("floors past dates at 0", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 20, 9, 30));
      expect(horizonDays("2026-06-18")).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/lib/__tests__/analytics.test.ts`
Expected: FAIL — cannot resolve `../analytics`.

- [ ] **Step 3: Implement `analytics.ts`**

Create `src/lib/analytics.ts`:

```ts
/* analytics — typed GA4 event helper. `track` is a safe no-op until GA is
   loaded (window.gtag is defined by <GoogleAnalytics>), so call sites never
   guard. See docs/superpowers/specs/2026-06-20-google-analytics-design.md. */
import { sendGAEvent } from "@next/third-parties/google";

export type AnalyticsEvent =
  | "search_performed"
  | "search_result_selected"
  | "pin_added"
  | "pin_removed"
  | "target_date_set"
  | "share_link_copied"
  | "model_lab_opened"
  | "explore_3d_opened"
  | "elevation_band_changed";
// Tier 2 (documented, not wired yet): units_toggled | theme_toggled |
// daily_outlook_expanded | threed_overlay_toggled | model_selected |
// source_link_clicked | scroll_depth

type Params = Record<string, string | number>;

export function track(event: AnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;
  if (typeof (window as unknown as { gtag?: unknown }).gtag !== "function") return;
  sendGAEvent("event", event, params);
}

export function mountainParams(m: { slug: string; name: string; region: string }) {
  return { mountain_slug: m.slug, mountain_name: m.name, region: m.region };
}

export function horizonDays(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, mo, d] = targetDate.split("-").map(Number);
  const target = new Date(y, mo - 1, d);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/lib/__tests__/analytics.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts src/lib/__tests__/analytics.test.ts
git commit -m "feat(analytics): typed track helper + mountain dims + horizonDays"
```

---

### Task 3: Search events (`search_performed`, `search_result_selected`)

**Files:**
- Modify: `src/components/create/MountainSearch.tsx`
- Test: `src/components/create/__tests__/MountainSearch.test.tsx`

**Interfaces:**
- Consumes: `track`, `mountainParams` from `@/lib/analytics`.
- Behavior: `search_performed { query_length }` fires once 600ms after the query settles (debounced, only when `query.trim().length >= max(1, minQueryLength)`); `search_result_selected { mountain dims }` fires inside `choose(m)`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/create/__tests__/MountainSearch.test.tsx`. First ensure the analytics mock is present at the top of the file (add if absent):

```tsx
import { track } from "@/lib/analytics";
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  mountainParams: (m: { slug: string; name: string; region: string }) => ({
    mountain_slug: m.slug,
    mountain_name: m.name,
    region: m.region,
  }),
}));
```

Then add these tests (use the file's existing render helper / `mountains` fixture; the fixture mountains must have `slug`, `name`, `region`):

```tsx
it("tracks search_result_selected with mountain dims on choose", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<MountainSearch mountains={MOUNTAINS} value={null} onSelect={onSelect} onClear={() => {}} />);
  await user.type(screen.getByRole("combobox"), "rain");
  await user.click(screen.getByRole("option", { name: /rainier/i }));
  expect(track).toHaveBeenCalledWith(
    "search_result_selected",
    expect.objectContaining({ mountain_slug: "rainier" }),
  );
});

it("tracks debounced search_performed with query_length", () => {
  vi.useFakeTimers();
  try {
    render(<MountainSearch mountains={MOUNTAINS} value={null} onSelect={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bake" } });
    vi.advanceTimersByTime(600);
    expect(track).toHaveBeenCalledWith("search_performed", { query_length: 4 });
  } finally {
    vi.useRealTimers();
  }
});
```

(Import `fireEvent` / `screen` / `userEvent` if not already imported. Adjust `MOUNTAINS` to the file's existing fixture name.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --config config/vitest.config.ts src/components/create/__tests__/MountainSearch.test.tsx`
Expected: FAIL — `track` not called (no wiring yet).

- [ ] **Step 3: Implement the wiring**

In `src/components/create/MountainSearch.tsx`, add the import after line 6:

```tsx
import { track, mountainParams } from "@/lib/analytics";
```

In `choose` (lines 46-50), add the track call:

```tsx
  const choose = (m: Mountain) => {
    setOpen(false);
    setQ(m.name);
    track("search_result_selected", mountainParams(m));
    onSelect(m);
  };
```

Add a debounced effect after the existing `setActive(-1)` effect (after line 37):

```tsx
  // Debounced search-intent event (fires once the query settles).
  React.useEffect(() => {
    const len = q.trim().length;
    if (len < Math.max(1, minQueryLength)) return;
    const id = setTimeout(() => track("search_performed", { query_length: len }), 600);
    return () => clearTimeout(id);
  }, [q, minQueryLength]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --config config/vitest.config.ts src/components/create/__tests__/MountainSearch.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/create/MountainSearch.tsx src/components/create/__tests__/MountainSearch.test.tsx
git commit -m "feat(analytics): track search_performed + search_result_selected"
```

---

### Task 4: Pin / target / share / Model-Lab / 3D events (MountainHeader + CopyLinkButton)

**Files:**
- Modify: `src/components/shared/CopyLinkButton.tsx`
- Test: `src/components/shared/__tests__/CopyLinkButton.test.tsx`
- Modify: `src/components/mountain/MountainHeader.tsx`
- Test: `src/components/mountain/__tests__/MountainHeader.test.tsx`

**Interfaces:**
- Produces: `CopyLinkButton` gains an optional `onCopied?: () => void` prop, called on every successful copy (async clipboard or legacy path).
- Consumes: `track`, `mountainParams`, `horizonDays` from `@/lib/analytics`.
- Events: `pin_added { mountain dims, target_horizon_days }` (on add and on "Update pin" re-target), `pin_removed { mountain dims }`, `target_date_set { mountain dims, target_horizon_days }` (DateSelector pick), `share_link_copied { mountain dims }`, `model_lab_opened { mountain dims }`, `explore_3d_opened { mountain dims }`.

- [ ] **Step 1: Write the failing test for `CopyLinkButton.onCopied`**

Add to `src/components/shared/__tests__/CopyLinkButton.test.tsx`:

```tsx
it("calls onCopied on a successful copy", async () => {
  const onCopied = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  const user = userEvent.setup();
  render(<CopyLinkButton url="https://x.test/y" onCopied={onCopied} />);
  await user.click(screen.getByRole("button"));
  expect(onCopied).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/components/shared/__tests__/CopyLinkButton.test.tsx`
Expected: FAIL — `onCopied` not invoked.

- [ ] **Step 3: Implement `onCopied` in `CopyLinkButton.tsx`**

Add to the props interface (after line 11):

```tsx
  /** called on every successful copy */
  onCopied?: () => void;
```

Update the signature (line 35): `export function CopyLinkButton({ url, onCopied }: CopyLinkButtonProps) {`

Add a success helper and use it in all three success paths inside `copy` (lines 50-63):

```tsx
  const copy = () => {
    const target = url ?? window.location.href;
    const succeed = () => {
      onCopied?.();
      flash("copied");
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(target)
        .then(succeed)
        .catch(() => {
          if (legacyCopy(target)) succeed();
          else flash("failed");
        });
    } else if (legacyCopy(target)) {
      succeed();
    } else {
      flash("failed");
    }
  };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/components/shared/__tests__/CopyLinkButton.test.tsx`
Expected: PASS (existing tests still green).

- [ ] **Step 5: Write the failing tests for MountainHeader events**

Add to `src/components/mountain/__tests__/MountainHeader.test.tsx`. Ensure the analytics mock is at the top (add if absent):

```tsx
import { track } from "@/lib/analytics";
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  mountainParams: (m: { slug: string; name: string; region: string }) => ({
    mountain_slug: m.slug,
    mountain_name: m.name,
    region: m.region,
  }),
  horizonDays: () => 2,
}));
```

Add tests (reuse the file's existing `MOUNTAIN` fixture + render helper; clear pins between tests as the file already does):

```tsx
it("tracks pin_added with horizon when pinning", async () => {
  const user = userEvent.setup();
  render(<MountainHeader mountain={MOUNTAIN} target="2026-06-22" />);
  await user.click(screen.getByRole("button", { name: /pin this peak/i }));
  expect(track).toHaveBeenCalledWith(
    "pin_added",
    expect.objectContaining({ mountain_slug: MOUNTAIN.slug, target_horizon_days: 2 }),
  );
});

it("tracks pin_removed when unpinning", async () => {
  const user = userEvent.setup();
  render(<MountainHeader mountain={MOUNTAIN} target="2026-06-22" />);
  await user.click(screen.getByRole("button", { name: /pin this peak/i }));   // pin
  await user.click(screen.getByRole("button", { name: /unpin this peak/i }));  // unpin
  expect(track).toHaveBeenCalledWith("pin_removed", expect.objectContaining({ mountain_slug: MOUNTAIN.slug }));
});

it("tracks model_lab_opened on the Model lab link", async () => {
  const user = userEvent.setup();
  render(<MountainHeader mountain={MOUNTAIN} target="2026-06-22" />);
  await user.click(screen.getByRole("link", { name: /model lab/i }));
  expect(track).toHaveBeenCalledWith("model_lab_opened", expect.objectContaining({ mountain_slug: MOUNTAIN.slug }));
});

it("tracks explore_3d_opened on the 3D link", async () => {
  const user = userEvent.setup();
  render(<MountainHeader mountain={MOUNTAIN} target="2026-06-22" />);
  await user.click(screen.getByRole("link", { name: /^3D$/i }));
  expect(track).toHaveBeenCalledWith("explore_3d_opened", expect.objectContaining({ mountain_slug: MOUNTAIN.slug }));
});
```

(If the existing file already mocks `next/navigation` `useRouter`, keep that mock so `onPick` doesn't throw.)

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run --config config/vitest.config.ts src/components/mountain/__tests__/MountainHeader.test.tsx`
Expected: FAIL — `track` not called.

- [ ] **Step 7: Implement the wiring in `MountainHeader.tsx`**

Add the import after line 20:

```tsx
import { track, mountainParams, horizonDays } from "@/lib/analytics";
```

Update the pin handlers (lines 49-61) to fire events:

```tsx
  let onPin = () => {
    addPin({ mountainId: slug, name: mountain.name, targetDate: effectiveTarget, notes: getPin(slug)?.notes ?? "" });
    track("pin_added", { ...mountainParams(mountain), target_horizon_days: horizonDays(effectiveTarget) });
  };
  if (pin && pin.targetDate === effectiveTarget) {
    pinLabel = "Pinned ✓";
    pinAria = "Unpin this peak";
    pinGhost = true;
    onPin = () => {
      removePin(slug);
      track("pin_removed", mountainParams(mountain));
    };
  } else if (pin) {
    pinLabel = "Update pin";
    pinAria = "Update your pin to this date";
    pinGhost = true;
    onPin = () => {
      updatePin(slug, { targetDate: effectiveTarget });
      track("pin_added", { ...mountainParams(mountain), target_horizon_days: horizonDays(effectiveTarget) });
    };
  }
```

Pass `onCopied` to `CopyLinkButton` (line 80):

```tsx
          <CopyLinkButton onCopied={() => track("share_link_copied", mountainParams(mountain))} />
```

Add `onClick` to the 3D and Model-lab links (lines 89-94):

```tsx
          <Link
            href={explore3dHref}
            className="btn btn-ghost btn-sm"
            onClick={() => track("explore_3d_opened", mountainParams(mountain))}
          >
            <Icons.compass size={15} /> 3D
          </Link>
          <Link
            href={modelLabHref}
            className="btn btn-ghost btn-sm"
            onClick={() => track("model_lab_opened", mountainParams(mountain))}
          >
            <Icons.sliders size={15} /> Model lab
          </Link>
```

Add `target_date_set` to the DateSelector `onPick` (line 103):

```tsx
            onPick={(date) => {
              track("target_date_set", { ...mountainParams(mountain), target_horizon_days: horizonDays(date) });
              router.push(`/mountains/${slug}?target=${date}`);
            }}
```

- [ ] **Step 8: Run the MountainHeader + CopyLinkButton tests to verify they pass**

Run: `npx vitest run --config config/vitest.config.ts src/components/mountain/__tests__/MountainHeader.test.tsx src/components/shared/__tests__/CopyLinkButton.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/shared/CopyLinkButton.tsx src/components/shared/__tests__/CopyLinkButton.test.tsx src/components/mountain/MountainHeader.tsx src/components/mountain/__tests__/MountainHeader.test.tsx
git commit -m "feat(analytics): track pin/target/share/model-lab/3d events"
```

---

### Task 5: Elevation-band + your-mountains pin_removed events

**Files:**
- Modify: `src/components/project/ElevationBandSelector.tsx`
- Test: `src/components/project/__tests__/ElevationBandSelector.test.tsx`
- Modify: `src/app/your-mountains/page.tsx`
- Test: `src/app/your-mountains/__tests__/page.test.tsx`

**Interfaces:**
- `elevation_band_changed { mountain_slug, band }` — slug resolved from the pathname (`/mountains/[slug]/...`) so the component stays decoupled; name/region are joinable via slug in GA.
- `pin_removed { mountain_slug, mountain_name }` on the your-mountains remove button (Pin has no `region`, so only slug+name are sent here).

- [ ] **Step 1: Write the failing test for ElevationBandSelector**

Add to `src/components/project/__tests__/ElevationBandSelector.test.tsx`. Add mocks at top (merge with any existing `next/navigation` mock):

```tsx
import { track } from "@/lib/analytics";
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mountains/rainier" }));
```

Test (desktop Segmented is rendered; click the "Base" radio/button):

```tsx
it("tracks elevation_band_changed with slug from the path", async () => {
  const user = userEvent.setup();
  render(<ElevationBandSelector />);
  await user.click(screen.getAllByRole("radio", { name: /base/i })[0]);
  expect(track).toHaveBeenCalledWith("elevation_band_changed", { mountain_slug: "rainier", band: "base" });
});
```

(If the existing tests rely on the band store, reset it in `beforeEach` as the file already does. Use `getAllByRole(...)[0]` because the component renders both desktop Segmented and mobile Select.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/components/project/__tests__/ElevationBandSelector.test.tsx`
Expected: FAIL — `track` not called.

- [ ] **Step 3: Implement the wiring in `ElevationBandSelector.tsx`**

Add imports after line 7:

```tsx
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
```

Inside the component (after line 21, the `setBand` line), add a tracking change handler and use it for both controls:

```tsx
  const pathname = usePathname();
  const onChange = (b: Band) => {
    setBand(b);
    const slug = pathname?.match(/^\/mountains\/([^/]+)/)?.[1];
    if (slug) track("elevation_band_changed", { mountain_slug: slug, band: b });
  };
```

Replace `onChange={setBand}` with `onChange={onChange}` on both the `<Segmented>` (line 27) and `<Select>` (line 35).

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/components/project/__tests__/ElevationBandSelector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for your-mountains pin_removed**

Add to `src/app/your-mountains/__tests__/page.test.tsx`. Add the analytics mock at top (merge with existing mocks):

```tsx
import { track } from "@/lib/analytics";
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
```

Test (seed a pin via the file's existing approach, then click remove):

```tsx
it("tracks pin_removed when removing a pinned mountain", async () => {
  const user = userEvent.setup();
  addPin({ mountainId: "rainier", name: "Mount Rainier", targetDate: "2026-06-22", notes: "" });
  render(<YourMountains />);
  await user.click(screen.getByRole("button", { name: /remove|unpin/i }));
  expect(track).toHaveBeenCalledWith("pin_removed", { mountain_slug: "rainier", mountain_name: "Mount Rainier" });
});
```

(Import `addPin` from `@/lib/pins` if not already; match the remove button's actual accessible name from the existing component — adjust the regex if needed.)

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/app/your-mountains/__tests__/page.test.tsx`
Expected: FAIL — `track` not called.

- [ ] **Step 7: Implement the wiring in `your-mountains/page.tsx`**

Add the import (after line 7's pins import):

```tsx
import { track } from "@/lib/analytics";
```

Update the remove `onClick` (line 51):

```tsx
                onClick={() => {
                  removePin(pin.mountainId);
                  track("pin_removed", { mountain_slug: pin.mountainId, mountain_name: pin.name });
                }}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/app/your-mountains/__tests__/page.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/project/ElevationBandSelector.tsx src/components/project/__tests__/ElevationBandSelector.test.tsx src/app/your-mountains/page.tsx src/app/your-mountains/__tests__/page.test.tsx
git commit -m "feat(analytics): track elevation_band_changed + your-mountains pin_removed"
```

---

### Task 6: Terraform env var + setup runbook

**Files:**
- Modify: `terraform/variables.tf`
- Modify: `terraform/main.tf` (the `module "web"` block)
- Modify: `terraform/modules/web/variables.tf`
- Modify: `terraform/modules/web/main.tf` (add `GA_MEASUREMENT_ID` env)
- Create: `docs/analytics-setup.md`

**Interfaces:**
- Produces: `GA_MEASUREMENT_ID` set on the Cloud Run `web` service from `var.ga_measurement_id` (supplied via `TF_VAR_ga_measurement_id`; default `""` → analytics disabled).

- [ ] **Step 1: Add the root variable**

In `terraform/variables.tf`, after the `alert_email` variable (line 13-16), add:

```hcl
variable "ga_measurement_id" {
  type        = string
  default     = ""
  description = "GA4 Measurement ID (G-XXXXXXXXXX). Supply via TF_VAR_ga_measurement_id; empty disables analytics. Not a secret, but kept out of the repo by convention."
}
```

- [ ] **Step 2: Pass it into the web module**

In `terraform/main.tf`, inside the `module "web"` block (after `source_root`, around line 96), add:

```hcl
  ga_measurement_id = var.ga_measurement_id
```

- [ ] **Step 3: Declare the module variable**

In `terraform/modules/web/variables.tf`, after `source_root` (line 8), add:

```hcl
variable "ga_measurement_id" {
  type    = string
  default = ""
}
```

- [ ] **Step 4: Add the Cloud Run env block**

In `terraform/modules/web/main.tf`, add another `env` block alongside the existing ones (e.g. after the `TOPIC_SATELLITE_REFRESH` block, before the secret-backed `AIRNOW_API_KEY` block):

```hcl
      env {
        name  = "GA_MEASUREMENT_ID"
        value = var.ga_measurement_id
      }
```

- [ ] **Step 5: Validate Terraform**

Run: `terraform -chdir=terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Write the setup runbook**

Create `docs/analytics-setup.md`:

```markdown
# Google Analytics (GA4) — Setup & Operations

Design: `docs/superpowers/specs/2026-06-20-google-analytics-design.md`.

## 1. Create the GA4 property
1. analytics.google.com → Admin → Create property (US/Pacific time zone).
2. Add a **Web** data stream for the Cloud Run URL → copy the **Measurement ID** (`G-XXXXXXXXXX`).

## 2. Deploy with the ID
The web app reads a server-only `GA_MEASUREMENT_ID` (NOT `NEXT_PUBLIC_*`). Supply it to Terraform and deploy:

\`\`\`bash
export TF_VAR_ga_measurement_id="G-XXXXXXXXXX"
terraform -chdir=terraform plan -out=PLAN
terraform -chdir=terraform apply PLAN
\`\`\`

Empty/unset → `<Analytics />` renders nothing (analytics off). Local dev is off by default; to test locally put `GA_MEASUREMENT_ID=G-XXXX` in `.env.local`.

## 3. Register custom dimensions (one-time, GA4 UI)
Admin → Custom definitions → Create custom dimension. Scope = **Event**. Create one per parameter (name must match exactly):

| Dimension name | Event parameter |
|---|---|
| Mountain slug | `mountain_slug` |
| Mountain name | `mountain_name` |
| Region | `region` |
| Target horizon (days) | `target_horizon_days` |
| Elevation band | `band` |

Until registered, params arrive on events but aren't available as report dimensions.

## 4. Events emitted (Tier 1)
`search_performed`, `search_result_selected`, `pin_added`, `pin_removed`, `target_date_set`, `share_link_copied`, `model_lab_opened`, `explore_3d_opened`, `elevation_band_changed`. Pageviews + engagement/returning-user metrics are automatic.

## 5. Verify
DebugView (Admin → DebugView) shows events in real time. Add `?_dbg=1`... use the GA Debugger extension, or check the **Realtime** report after deploy.
```

- [ ] **Step 7: Commit**

```bash
git add terraform/variables.tf terraform/main.tf terraform/modules/web/variables.tf terraform/modules/web/main.tf docs/analytics-setup.md
git commit -m "feat(analytics): GA_MEASUREMENT_ID Cloud Run env + setup runbook"
```

---

### Task 7: Full-suite gate + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite with coverage**

Run: `npm run test:coverage`
Expected: all tests pass; coverage ≥ 90/90/85. If a new file dipped coverage, add the missing-branch test before proceeding.

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 3: Validate Terraform**

Run: `terraform -chdir=terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Confirm spec coverage**

Re-read `docs/superpowers/specs/2026-06-20-google-analytics-design.md` §C and confirm every Tier-1 event has a wired call site (search ×2, pin ×2, target, share, model-lab, 3d, band) and §A wiring + §D dimensions are documented.

- [ ] **Step 5: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "test(analytics): coverage + final verification"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** §A wiring → Task 1; §B helper → Task 2; §C Tier-1 events → Tasks 3–5 (all 9 events have call sites); §C Tier-2 → documented as a comment in `analytics.ts` (Task 2), not wired (per spec); §D custom dimensions → Task 6 runbook; §E testing → every task is TDD, Task 7 is the gate; §E deploy → Task 6. **Deviation noted:** `elevation_band_changed` carries `mountain_slug` only (resolved from the path) rather than full mountain dims, to keep the band selector decoupled — name/region join via slug in GA. All other mountain-context events carry full dims.

**Placeholder scan:** none — every code/test step has concrete content.

**Type consistency:** `track(event, params)`, `mountainParams({slug,name,region})`, `horizonDays(targetDate)` used identically across Tasks 2–5; `onCopied?: () => void` defined and consumed in Task 4; `GA_MEASUREMENT_ID` / `ga_measurement_id` consistent across Task 1 and Task 6.
