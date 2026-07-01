# Google Analytics (GA4) — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm), ready for implementation plan
**Scope:** Add solid GA4 website + behavioral tracking to the Mountain Weatherman web app.

## Goals

Understand audience and behavior:
- **Who views which mountains** (and region breakdown).
- **Dwell time** / engagement on the site and per mountain.
- **Return frequency** (how often users come back).
- **Pin activity** and other high-value interactions.

Audience is US-focused (Washington/Oregon). **No login / no accounts** — returning users are measured per-browser via GA4's client_id, which is the right model here (no cross-device user-id).

## Decisions (locked during brainstorm)

1. **No consent banner.** Fire analytics immediately for all users (US/PNW audience).
2. **`@next/third-parties/google`** — Google's official Next.js package (not manual gtag, not GTM).
3. **Tiered events.** Implement high-value core events now; structure the helper so finer events are trivial to add later.
4. **Rich custom dimensions** — attach `mountain_slug` + `mountain_name` + `region` (+ `target_horizon_days`, `band`) so reports can slice by mountain/region.

## A. Architecture & wiring

- Render `<GoogleAnalytics gaId={...} />` once in the root `src/app/layout.tsx`. It injects gtag.js with Next's loading optimizations and **auto-fires a pageview on every SPA route change** — so per-mountain views (`/mountains/[slug]`), dwell time, and returning-user metrics come for free.
- **Server-only env var `GA_MEASUREMENT_ID`** (NOT `NEXT_PUBLIC_*`).
  - **Why not `NEXT_PUBLIC_*`:** those are inlined at *build* time, which would force threading the ID through Cloud Build substitutions in `terraform_data.build`. The root layout is a **server component** — it reads `process.env.GA_MEASUREMENT_ID` at *runtime* and passes it as a prop. `sendGAEvent()` in client components doesn't need the ID (it pushes to the already-configured gtag), so no value needs build-time inlining.
  - Set declaratively on the Cloud Run service in the Terraform `web` module — same pattern as `GCP_PROJECT`, `GCS_BUCKET_*`, `TOPIC_*`.
- **Gating:** `<GoogleAnalytics>` renders only when `GA_MEASUREMENT_ID` is set. Local dev and tests don't set it → **zero tracking locally by default**. Can be added to `.env.local` to test against a debug GA property.

## B. Tracking helper — `src/lib/analytics.ts`

A single typed wrapper; the event catalog lives in one place.

```ts
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
  // Tier 2 (documented, not wired yet):
  // | "units_toggled" | "theme_toggled" | "daily_outlook_expanded"
  // | "threed_overlay_toggled" | "model_selected" | "source_link_clicked" | "scroll_depth"

// One helper. Safe no-op when GA isn't loaded (local/dev/SSR/missing gtag).
export function track(event: AnalyticsEvent, params?: Record<string, string | number>): void;

// Standard mountain dimensions from a catalog/mountain object.
export function mountainParams(m: { slug: string; name: string; region: string }): {
  mountain_slug: string;
  mountain_name: string;
  region: string;
};

// target_horizon_days = whole days from today to a YYYY-MM-DD target (>= 0).
export function horizonDays(targetDate: string): number;
```

- `AnalyticsEvent` is a string-union → unknown/typo'd events fail typecheck.
- `track` guards SSR / missing `window.gtag` so it's a safe no-op everywhere GA is inactive.

## C. Event taxonomy

### Tier 1 — implemented now (high-value conversions)

All carry `mountain_slug` / `mountain_name` / `region` where a mountain is in context.

| Event | Extra params | Fired from |
|---|---|---|
| `search_performed` | `query_length` | MountainSearch |
| `search_result_selected` | (mountain dims) | MountainSearch |
| `pin_added` | `target_horizon_days` | pin control |
| `pin_removed` | (mountain dims) | pin control |
| `target_date_set` | `target_horizon_days` | target-date picker |
| `share_link_copied` | (mountain dims) | CopyLinkButton |
| `model_lab_opened` | (mountain dims) | Model Lab link |
| `explore_3d_opened` | (mountain dims) | 3D link |
| `elevation_band_changed` | `band` | ElevationBandSelector |

*Exact call-site components are mapped in the implementation plan.*

### Tier 2 — documented in the catalog, NOT wired yet (one-liners to add later)

`units_toggled`, `theme_toggled`, `daily_outlook_expanded`, `threed_overlay_toggled`, `model_selected`, `source_link_clicked`, `scroll_depth`.

## D. Custom dimensions to register in GA4 (one-time, web UI)

Event-scoped custom dimensions (Admin → Custom definitions → Create custom dimension; scope = Event; parameter name must match exactly):

- `mountain_slug`
- `mountain_name`
- `region`
- `target_horizon_days`
- `band`

(Add `units` / `theme` when Tier 2 lands.) Until registered, the params still arrive on events but won't be available as report dimensions.

## E. Testing & deploy

- **Unit tests** (`src/lib/__tests__/analytics.test.ts`): `horizonDays` math, `track` no-ops without `window.gtag`, `track` calls `sendGAEvent` with merged params when gtag present, `mountainParams` shape.
- **Component tests:** mock the `@/lib/analytics` module and assert `track` is called with the correct event + params at each Tier-1 call site.
- **TDD:** failing test first, then implementation. Keep the 90/90/85 lines/functions/branches coverage gate green.
- **Deploy:** add `GA_MEASUREMENT_ID` to the Terraform `web` module Cloud Run env; ship via `terraform -chdir=terraform apply` (web image rebuild). `terraform validate` stays clean.

## Non-goals

- No consent management / cookie banner.
- No GTM.
- No server-side / Measurement Protocol events.
- No cross-device user identity (no login).
- Tier 2 events are documented only, not implemented in this pass.
