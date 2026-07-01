# Forecast convergence charts redesign

Date: 2026-06-29
Status: Design approved (pending spec review)

## Problem

Two charts ask the user to judge whether a forecast can be trusted, but neither
makes its takeaway visually obvious — both lean on a caption to be decoded:

1. **`CallChart`** (Forecast tab, `MountainDetail.tsx`) — heading "Is your day's
   forecast settling?". Draws a cross-model min..max envelope band + mid line
   against lead time, with a verdict chip.
2. **`ForecastEvolutionChart`** (Model Lab, `/mountains/[slug]/models`) — heading
   "Forecast evolution — how the target-day call has shifted". Draws one line per
   model showing each model's target-day prediction across successive snapshots.

Root cause of the confusion: **both are labeled "settling," but "settling" conflates
two distinct signals** —
- **Stability** (temporal): has an individual model stopped changing its own mind
  run-to-run?
- **Agreement** (inter-model): do the different models converge to the same answer?

`CallChart` shows only agreement (the band) on an abstract lead-time axis.
`ForecastEvolutionChart` shows per-model drift but lets the eye infer agreement.
Neither cleanly answers one question, so each needs prose to interpret.

## Goals

Give each chart one clear job, matched to its audience:

- **Forecast tab (consumer):** answer "can I trust the forecast for my day yet?"
  The two signals stay blended into a single, intuitive "trust" picture.
- **Model Lab (expert):** pull the two signals apart so a power user can tell
  *agreement without stability* from *stability without agreement*.

No new data sources. Both charts continue to consume `WeatherSnapshot[]` + a
`targetDate`, sharing prep helpers in `src/lib/forecast-select.ts`. Charts remain
hand-built SVG in the existing calm alpine style (not Recharts).

## Non-goals

- No change to the snapshot pipeline, types, or fetch layer.
- No new variables beyond the existing Temp / Wind / Freezing / Precip set.
- No change to the early/empty state behavior (under-3-snapshots "Tracking just
  started" message stays).

---

## Part 1 — Forecast tab chart (consumer): "Can I trust this yet?"

Audience: casual hiker. Job: make "the call is settling / not yet" unmistakable
without reading a caption. Keep it chart-first (do not demote to a meter).

**Component:** `src/components/project/CallChart.tsx` (rework in place).

**Heading (unchanged):** "Is your day's forecast settling?"

**Encoding:**
- **X axis:** lead time, decreasing left→right, `now` on the right edge
  (`−3d … −1d … now`). Unchanged from today.
- **Y axis:** selected variable (Temp / Wind / Freezing / Precip), unit-aware,
  precip pinned to 0 min. Unchanged.
- **3 model lines** — HRRR (`--accent`), GFS (`--caution`), ECMWF (`--good`) —
  each = that model's prediction *for the target day* at each lead time. This
  replaces the single mid line. The lines visibly braid together toward `now`
  when the forecast is settling.
- **Soft spread fill** behind the lines: the cross-model min..max envelope in one
  calm accent (no color-by-spread). Narrowing toward `now` = agreement, glanceable.
- **Legend:** the three model names with their line colors.
- **Verdict chip** (enlarged; the *only* amber/green element on the chart):
  - green **"Settling — models agree"** when `firming` is true
  - amber **"Still shifting"** otherwise
  (reworded from "Firming up" / "Still volatile").
- **Caption** (trimmed to one light line): "Three models, converging toward your day."

**Color rule:** one calm accent for the fill and neutral axes; convergence (lines
merging + band narrowing) carries the signal. Only the verdict chip is amber/green.

**Variable selector:** unchanged Segmented control (Temp / Wind / Freezing / Precip).

**Early/empty state:** unchanged — `snapshots.length < 3 || runs.length < 2` →
"Tracking just started" calm message.

**Data prep:** reuse `convergenceRuns` (min/max/mid per lead day) for the envelope,
plus per-model series for the three lines. The three model lines need a per-model
value at each lead day; add a helper alongside `convergenceRuns` that returns each
model's target-day value keyed by lead day (newest issuance per lead day, matching
how `convergenceRuns` collapses ~hourly snapshots). `convergenceVerdict` (the
`firming` boolean) is unchanged.

---

## Part 2 — Model Lab chart (expert): pull the two signals apart

Audience: power user. Job: separate **stability** (per-model, temporal) from
**agreement** (inter-model) so the two failure modes are distinguishable.

**Component:** `src/components/modellab/ForecastEvolutionChart.tsx` (rework in place).

**Heading (retuned):** "Forecast evolution — are the models locking in?"

**Encoding (Option A — one richer view):**
- **X axis:** snapshot issue date, oldest → newest. Unchanged.
- **Y axis:** selected variable, unit-aware. Unchanged.
- **3 model lines** over issue-date — each model's target-day prediction run-to-run.
  Unchanged geometry; keeps inactive-model 0.45-opacity behavior tied to the shared
  `active` chip state.
- **NEW — agreement envelope:** a faint cross-model min..max spread band *behind*
  the lines, computed per issue date. Band shrinking left→right = models converging.
  This makes the **agreement** signal explicit rather than inferred.
- **NEW — per-model stability chip:** next to each model name in the legend, a small
  chip showing how much that model moved over its last N runs — e.g. "GFS ±1°F /
  3 runs" — colored green (locked) or amber (still drifting). This is the
  **stability** signal, per model.

**Why it earns its keep over the consumer chart:** the consumer view blends the two
signals; this view distinguishes:
- *Agreement without stability* — tight band, all stability chips amber → "they
  agree today but all three are still drifting."
- *Stability without agreement* — green chips, wide band → "each model is
  confident, but they confidently disagree."

**Stability metric (per model, per selected variable):**
- `range = max − min` of the model's target-day prediction across the **last 3
  snapshots** (the stability window).
- Display as `±(range / 2)` in display units, suffixed "/ 3 runs".
- Color green if `range ≤ threshold`, amber otherwise. Per-variable thresholds:
  - Temp: ±2 °F (i.e. range ≤ 4 °F)
  - Wind: ±5 mph (range ≤ 10 mph)
  - Freezing: ±500 ft (range ≤ 1000 ft)
  - Precip: ±0.1 in (range ≤ 0.2 in)
- Thresholds defined as a single constant map so they are tunable in one place.
- If a model has fewer than 2 available target-day values in the window, its chip
  shows "—" (insufficient history), neutral color.

**Caption:** "Lines = each model's drift. Band = how far apart they are. Chips =
how settled each model is."

**Variable selector:** unchanged (`VAR_OPTIONS`: Temp / Wind / Freezing / Precip).

**Early/empty state:** unchanged — fewer than 3 snapshots → "Tracking just started."

**Data prep:** add helpers in `src/lib/forecast-select.ts`:
- a cross-model min..max envelope per snapshot issue date (for the band), and
- a per-model stability range over the last 3 snapshots for the selected variable
  (for the chips), reusing `EVO_FIELD` for variable→field mapping.

---

## Shared decisions

- **Stability window:** 3 runs (more responsive on short pin histories than 5).
- **Verdict wording:** consumer chip "Settling — models agree" / "Still shifting".
- **Color discipline:** one calm accent + neutral axes on both charts; amber/green
  reserved for the verdict chip (consumer) and stability chips (expert).
- **Captions:** one light line each, since the visuals now carry the takeaway.

## Affected files

- `src/components/project/CallChart.tsx` — add model lines + legend, reword chip,
  trim caption.
- `src/components/modellab/ForecastEvolutionChart.tsx` — add agreement envelope +
  per-model stability chips, retune heading/caption.
- `src/lib/forecast-select.ts` — add per-model-by-lead-day series (consumer),
  per-issue-date envelope + per-model stability range (expert).
- `src/lib/__tests__/forecast-select.test.ts` — tests for the new helpers.
- `src/components/project/__tests__/` and `src/components/modellab/__tests__/` —
  update/extend chart tests (legend, lines, chips, verdict wording).

## Testing

TDD per project gates (Vitest, coverage 90/90/85). Failing tests first:

- **Helpers (`forecast-select.ts`):**
  - per-model-by-lead-day series: collapses ~hourly snapshots to newest issuance
    per lead day; omits unavailable/null target-day values.
  - per-issue-date envelope: cross-model min/max with 1–3 models available.
  - stability range: `max − min` over last 3 snapshots; "—" with < 2 values;
    correct green/amber against each per-variable threshold (boundary cases at the
    threshold).
- **`CallChart`:** renders 3 model lines + legend; verdict chip shows new wording
  for firming vs not; early state unchanged.
- **`ForecastEvolutionChart`:** renders the agreement envelope + a stability chip
  per model with correct value/color; inactive-model opacity preserved; early
  state unchanged.
- Existing a11y assertions (vitest-axe) hold; SVG charts keep `role="img"` + aria.

## Risks / notes

- Three lines on the small consumer panel risk reading as clutter; the soft fill +
  calm single accent + restrained legend mitigate this. Verify on the 390px mobile
  pass (both themes) per the project's mobile QA harness.
- Model names (HRRR/GFS/ECMWF) are intentionally surfaced on the consumer tab per
  user decision — keep the legend compact.
