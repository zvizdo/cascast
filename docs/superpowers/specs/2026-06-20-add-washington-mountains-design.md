# Add Washington (+ Oregon) Mountains — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm), ready for implementation plan
**Branch:** `feature/add-mountains` (off `main` @ `2b971c7`, which includes the merged Phase 3A terrain work)

## Goal

Expand the catalog from **11 → 38** mountains by adding a curated set of serious Washington alpine objectives (the gap: non-volcanic North Cascades / Stuart Range / Olympics peaks) plus five Oregon Cascade volcanoes. Each added peak must carry correct, cross-checked data so its weather / avalanche / SNOTEL / satellite / safety / terrain feeds work or degrade gracefully.

## Selection bar (user decision)

"Curated 'serious mountains' blend" — top alpine objectives + high topographic prominence across all WA regions, cross-checked against the **Bulger 100-highest**, the **P2000 prominence list**, and classic North Cascades climbing references (Alpine Institute / NPS / *50 Classic Climbs*).

## The 27 new mountains

Slugs follow the existing `mt-*` / `*-peak` convention. Summit elevations are approximate (identification only) and **must be cross-checked against ≥2 sources during implementation** per `references/add-mountain.md` §6.

### Washington — Tier 1 (highest-signal)
| Name | slug | region | ~summit | Significance |
|---|---|---|---|---|
| Mount Stuart | `mt-stuart` | cascades-central | 9,415' | 2nd-highest non-volcano in WA; classic granite |
| Bonanza Peak | `bonanza-peak` | cascades-north | 9,516' | Highest non-volcanic peak in WA; most prominent non-volcano |
| Mount Goode | `mt-goode` | cascades-north | 9,220' | Highest peak in North Cascades NP |
| Eldorado Peak | `eldorado-peak` | cascades-north | 8,868' | Iconic glaciated objective |
| Forbidden Peak | `forbidden-peak` | cascades-north | 8,815' | West Ridge = a *50 Classic Climbs of North America* |
| Dragontail Peak | `dragontail-peak` | cascades-central | 8,840' | Stuart Range classic |
| Sahale Peak | `sahale-peak` | cascades-north | 8,680' | Most popular intro glacier climb (Cascade Pass) |
| Sloan Peak | `sloan-peak` | cascades-north | 7,835' | "Matterhorn of the Cascades," Mountain Loop |
| Mount Constance | `mt-constance` | olympics | 7,756' | Dominant eastern-Olympics objective |
| Gilbert Peak (Goat Rocks) | `gilbert-peak` | cascades-south | 8,201' | Highest of the Goat Rocks; fills the S-Cascades non-volcanic gap |

### Washington — Tier 2 (strong adds)
| Name | slug | region | ~summit | Significance |
|---|---|---|---|---|
| Mount Fernow | `mt-fernow` | cascades-central | 9,249' | Highest of the Entiat Mountains |
| Mount Buckner | `mt-buckner` | cascades-north | 9,114' | High glaciated peak by Sahale |
| Mount Logan | `mt-logan` | cascades-north | 9,087' | Major remote North Cascades summit |
| Mount Maude | `mt-maude` | cascades-central | 9,082' | Entiat, Bulger classic |
| Seven Fingered Jack | `seven-fingered-jack` | cascades-central | 9,077' | Entiat, often linked with Maude |
| Jack Mountain | `jack-mountain` | cascades-north | 9,066' | Big prominence above Ross Lake |
| Black Peak | `black-peak` | cascades-north | 8,970' | Striking peak near Rainy Pass |
| Dome Peak | `dome-peak` | cascades-north | 8,920' | Heart of the Ptarmigan Traverse |
| Cannon Mountain | `cannon-mountain` | cascades-central | 8,638' | Enchantments rampart |
| Mount Deception | `mt-deception` | olympics | 7,788' | Highest of the eastern Olympics |
| Whitehorse Mountain | `whitehorse-mountain` | cascades-north | 6,840' | Huge relief over the Mountain Loop valley |
| Three Fingers | `three-fingers` | cascades-north | 6,854' | Iconic lookout summit, Mountain Loop |

### Oregon (user additions)
| Name | slug | region | ~summit | Significance |
|---|---|---|---|---|
| Mount Jefferson | `mt-jefferson` | oregon | 10,497' | 2nd-highest in OR; major glaciated climb; **volcano** |
| South Sister | `south-sister` | oregon | 10,358' | Highest of the Three Sisters; **volcano** |
| North Sister | `north-sister` | oregon | 10,085' | Most technical Sister; **volcano** |
| Middle Sister | `middle-sister` | oregon | 10,047' | **volcano** |
| Mount Thielsen | `mt-thielsen` | oregon | 9,184' | "Lightning rod of the Cascades," near Crater Lake; eroded **volcano** |

> **Assumption to verify:** "Mount Tilson" (voice) is read as **Mount Thielsen** — there is no notable "Mount Tilson" in Oregon. Confirm before seeding.

## Per-mountain field requirements

Per `references/add-mountain.md` §1 (the `Mountain` type is the only compile-time guard). All values **cross-checked against ≥2 independent sources** (PeakBagger + USGS/CalTopo for lat/lng/elevation; avalanche.org for NWAC zone id; NRCS for SNOTEL triplet).

**Required for every peak:** `slug`, `name`, summit `lat`/`lng`, `elevations.{base,mid,summit}` (feet; base/mid are judgment calls per §5), `region`, `timezone` (`America/Los_Angeles`), `description`.

**Conditional / optional fields and which peaks get them:**

| Field | Applies to | Notes |
|---|---|---|
| `nwacZone` + `nwacZoneId` | All **WA** peaks (assign the correct West/East-Slopes-N/C/S or Olympics zone by crest side) | **Empty `""`** for the 5 Oregon peaks south of Mt Hood (Jefferson, the Sisters, Thielsen) — south of NWAC coverage → nwac route/worker short-circuits (empty-pattern, like Whitney). |
| `snotelStationId` + `snotelStationTriplet` + `snotelStationName` | Peaks with a genuinely nearby NRCS SNOTEL station (state `WA`/`OR`) | **Empty `""`** for remote peaks with no nearby station (likely Bonanza, Logan, Jack, Dome, and verify the far-back NoCa peaks) → snotel worker early-returns. OR peaks: check Oregon SNOTEL (network `SNTL`, state `OR`). |
| `hansVolcanoId` | The **5 Oregon volcanoes** only (Jefferson, South/Middle/North Sister, Thielsen) | Verify each id via the HANS `getMonitoredVolcanoes` endpoint before adding; omit if not monitored. WA additions are non-volcanic → omit. |
| `npsParkCode` | **North Cascades NP** (`noca`): Eldorado, Forbidden, Sahale, Buckner, Goode, Logan (verify each is inside the park boundary). **Olympic NP** (`olym`): Constance, Deception (verify). | Omit for wilderness/NF peaks (Goat Rocks, Stuart Range, Entiat, Mountain Loop, all OR peaks). |
| `airnowHint` | None | Omit — nearest-by-lat/lng is adequate (matches all 11 current peaks). |
| `mapBbox` | All 27 | **Auto-derivable**: `±0.08°` box around summit lat/lng. Generate mechanically; no research. |
| `permits` | All where a real access permit/pass exists | Research per peak (NW Forest Pass, Enchantments permit for Dragontail/Cannon, NoCa/Olympic NP wilderness permits, etc.). Match the existing entries' shape `{label,url,note?}`. |
| `webcams` | Where a relevant public webcam exists | Sparse/optional; research per peak; `{id,label,source,url,seasonal?}`. Skip where none. |

## Implementation procedure (per `references/add-mountain.md` §"How to add one")

For the batch: (1) append all 27 records to `MOUNTAINS` in `src/lib/mountains-data.ts` (keep field order); (2) run the §6 validation checklist per peak; (3) `npm run seed:mountains` (Firestore upsert for the Python functions); (4) **`terraform apply`** web image rebuild (MANDATORY — the web serves the catalog from the bundled constant); (5) `trigger-refresh` per source per peak to backfill immediately; (6) **3D terrain bake** per peak (`export-peaks.ts` → `build_terrain --mountain <slug>`); (7) **illustrative routes** `public/routes/<slug>.geojson` per peak + extend `routes.test.ts` `EXPECTED_COUNTS`.

## Test / invariant updates (required)

`src/lib/__tests__/mountains-data.test.ts` encodes WA/OR assumptions that this batch breaks:
- **Widen the coordinate bounding box** to include the Oregon peaks south to Thielsen (~43.15°N) and the Sisters/Jefferson longitudes.
- **Make NWAC checks conditional** (`if (m.nwacZoneId) …`) so the 5 empty-NWAC Oregon peaks pass.
- **Make SNOTEL triplet-regex checks conditional** on a non-empty triplet (remote peaks carry `""`).
- Keep the existing slug-uniqueness / required-field invariants (they should pass for all 38).

`src/data/routes/__tests__/routes.test.ts`: add each new slug + route-point count to `EXPECTED_COUNTS`.

## Action items (explicit)

1. **Update `references/add-mountain.md` after implementation** (user-requested): bump the count to **38**, and ensure the field table fully documents the Phase 3A terrain fields (`mapBbox`, `webcams`, `permits`) and their sourcing — the doc currently predates that merge for these fields in its procedure.
2. Update mountain-count references in `README.md` ("All 10 mountains" is already stale → should become 38) and `CLAUDE.md` where it cites the count.

## Non-goals

- No new `Mountain` fields or schema changes — only data rows + test-invariant widening.
- No admin/write UI (catalog stays file-defined).
- No change to infra resource names.
- `airnowHint` left empty for all (nearest-by-location suffices).

## Dependencies (now satisfied)

Originally gated on the Phase 3A terrain branch (`mapBbox`/`webcams`/`permits`); **that merged into `main` @ `2b971c7`**, so this branch (based on it) can populate the complete field set in one pass.
