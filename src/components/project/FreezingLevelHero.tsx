/* FreezingLevelHero — STATIC freezing-level cross-section (no scrubber).
   Ported from app/hero.jsx FreezingLevelHero. A Dawn/Midday/PM toggle re-points the FEATURED
   freezing level (`feat`) used by the cross-section plane, the side readout, and the takeaway.
   The day's min–max freezing range stays encoded as a translucent band; the DayStrip provides the
   labeled temporal read. All displayed elevation / temperature labels convert through useUnits; the
   SVG geometry uses canonical feet. */
"use client";
import * as React from "react";
import { DayStrip } from "./DayStrip";
import { Segmented } from "@/components/shared/Segmented";
import { Provenance, type ProvenanceData } from "@/components/shared/Provenance";
import { Icons } from "@/components/icons/icons";
import { useUnits, fmtDist, fmtTemp } from "@/lib/units";
import { noonRow, representativeRow, type TimeOfDay } from "@/lib/forecast-select";
import type { HourRow } from "@/lib/forecast-select";
import type { Mountain } from "@/lib/types";
import type { Band } from "@/lib/band";

export interface FreezingLevelHeroProps {
  mountain: Pick<Mountain, "name" | "elevations">; // elevations in FEET (§3)
  dayRows: HourRow[]; // target-day rows of the chosen model
  modelLabel: string; // e.g. "HRRR · 3 km"
  bandNames?: { base: string; mid: string; summit: string };
  prov?: ProvenanceData; // loud inline provenance for the chosen freezing model
}

const W = 860;
const H = 440;
const DEFAULT_BAND_NAMES = { base: "Base", mid: "Mid", summit: "Summit" };
const TOD_LABEL: Record<TimeOfDay, string> = { dawn: "Dawn", midday: "Midday", pm: "PM" };

// Stylized single-peak silhouette as a fraction of the valley→summit climb at each
// x (0..1). The summit (x=0.64) is the unique high point, so the profile scales to
// ANY peak — a short summit (e.g. Eldorado 8,873 ft) no longer has foreground ridges
// drawn at fixed absolute feet towering over it (the old "two peaks" bug).
const RIDGE_SHAPE: [number, number][] = [
  [0.0, 0.05],
  [0.1, 0.18],
  [0.22, 0.34],
  [0.33, 0.52],
  [0.46, 0.72],
  [0.57, 0.92],
  [0.64, 1.0],
  [0.72, 0.9],
  [0.82, 0.62],
  [0.92, 0.36],
  [1.0, 0.16],
];

/** Ridge silhouette vertices [x∈0..1, elevationFt] scaled to this peak. */
export function ridgeProfile(valley: number, summit: number): [number, number][] {
  return RIDGE_SHAPE.map(([x, h]): [number, number] => [x, valley + h * (summit - valley)]);
}

/** Keep a minimum vertical gap (% of the figure) between stacked band-card tops so cards
 *  for closely-spaced bands (short peaks like Eldorado, summit≈mid) don't collide on desktop.
 *  Input is top→bottom order; each card is nudged down to clear the one above it. */
export function spreadTops(tops: number[], minGap: number): number[] {
  let prev = -Infinity;
  return tops.map((t) => {
    const v = t < prev + minGap ? prev + minGap : t;
    prev = v;
    return v;
  });
}

/** Final desktop band-card tops (% of figure): spread to avoid overlap, then shift the whole
 *  stack up (preserving gaps) if the bottom card would run past `maxTop` — keeps the lowest
 *  band (whose elevation sits near the valley floor) fully visible instead of clipped. */
export function bandCardTops(rawTops: number[], minGap: number, maxTop: number): number[] {
  const spread = spreadTops(rawTops, minGap);
  const overflow = spread[spread.length - 1] - maxTop;
  return overflow > 0 ? spread.map((t) => Math.max(2, t - overflow)) : spread;
}

export function FreezingLevelHero({
  mountain,
  dayRows,
  modelLabel,
  bandNames = DEFAULT_BAND_NAMES,
  prov,
}: FreezingLevelHeroProps) {
  const { temp, dist } = useUnits();
  const uid = React.useId().replace(/[:]/g, "");
  const [tod, setTod] = React.useState<TimeOfDay>("dawn");

  const valley = 2200;
  const summit = mountain.elevations.summit;
  const top = summit + 1800;
  const Y = (e: number) => H - 40 - ((e - valley) / (top - valley)) * (H - 80);

  const feat = representativeRow(dayRows, tod) ?? noonRow(dayRows);
  const fls = dayRows.map((r) => r.fl).filter((v): v is number => v != null);
  if (!feat || !fls.length || feat.fl == null) {
    return (
      <div className="hero">
        <div className="hero-figure">
          <p className="mono-dim" style={{ padding: 24 }}>
            Freezing-level data unavailable for the target day.
          </p>
        </div>
      </div>
    );
  }
  const flFeat = feat.fl;
  const flMin = Math.min(...fls);
  const flMax = Math.max(...fls);

  // stylized ridge profile (peaks at summit), scaled to this peak's height
  const sx = (f: number) => f * W;
  const ridge = ridgeProfile(valley, summit);
  let ridgePath = `M ${sx(ridge[0][0])} ${Y(ridge[0][1])}`;
  for (let i = 1; i < ridge.length; i++) {
    const p0 = ridge[i - 1];
    const p1 = ridge[i];
    const cx = (sx(p0[0]) + sx(p1[0])) / 2;
    ridgePath += ` C ${cx} ${Y(p0[1])}, ${cx} ${Y(p1[1])}, ${sx(p1[0])} ${Y(p1[1])}`;
  }
  const fillPath = `${ridgePath} L ${W} ${H} L 0 ${H} Z`;

  const bands: { key: Band; e: number; name: string; lx: number }[] = [
    { key: "summit", e: summit, name: bandNames.summit, lx: 0.64 },
    { key: "mid", e: mountain.elevations.mid, name: bandNames.mid, lx: 0.5 },
    { key: "base", e: mountain.elevations.base, name: bandNames.base, lx: 0.3 },
  ];
  const precipFor = (e: number): "snow" | "rain" | "mixed" => {
    if (Math.abs(e - flFeat) < 600) return "mixed";
    return e > flFeat ? "snow" : "rain";
  };
  // Desktop card tops (% of figure): ≥22% apart so close bands (short peaks) clear each
  // other even when the precip line wraps, and shifted up if the lowest would clip the frame.
  const cardTops = bandCardTops(
    bands.map((b) => (Y(b.e) / H) * 100),
    22,
    82,
  );

  const snowG = `snowG-${uid}`;
  const rockG = `rockG-${uid}`;
  const skyG = `skyG-${uid}`;
  const mtnClip = `mtnClip-${uid}`;

  const takeaway =
    flFeat < mountain.elevations.base
      ? "below the trailhead"
      : flFeat > summit
        ? "above the summit"
        : `${fmtDist(summit - flFeat, dist)} below the summit`;

  // Labeled elevation ticks: even-thirds across the chart domain, units-aware (faint gridlines).
  const axisTicks = [valley, valley + (top - valley) / 3, valley + (2 * (top - valley)) / 3, top].map(
    (e) => Math.round(e),
  );

  const todLabel = TOD_LABEL[tod];

  // Freezing-level chip: size the pill to its text (the label varies with units + time-of-day,
  // so a fixed width let the tail spill outside the badge — invisible white-on-sky in light theme).
  const chipText = `FREEZING LEVEL · ${fmtDist(flFeat, dist)} · ${todLabel.toUpperCase()}`;
  const chipW = Math.ceil(chipText.length * 7.25) + 20;

  return (
    <div className="hero">
      <div className="hero-figure">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block" }}
          role="img"
          aria-label={`Cross-section of ${mountain.name}: thaw line at ${fmtDist(flFeat, dist)} (${todLabel})`}
        >
          <defs>
            <linearGradient id={snowG} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--snow-hi)" />
              <stop offset="1" stopColor="var(--snow-lo)" />
            </linearGradient>
            <linearGradient id={rockG} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--rock-hi)" />
              <stop offset="1" stopColor="var(--rock-lo)" />
            </linearGradient>
            <linearGradient id={skyG} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--sky-hi)" />
              <stop offset="1" stopColor="var(--sky-lo)" />
            </linearGradient>
            <clipPath id={mtnClip}>
              <path d={fillPath} />
            </clipPath>
          </defs>

          {/* opaque base: the figure-column background (rock-lo on desktop) only fills the strip
              BELOW the SVG; this keeps it from bleeding through the translucent sky/shade washes
              so the sky stays light and identical across breakpoints. */}
          <rect x="0" y="0" width={W} height={H} fill="var(--surface)" />

          {/* above/below-freezing shading across the whole frame: frozen above the line, warm below */}
          <rect
            x="0"
            y="0"
            width={W}
            height={Y(flFeat)}
            className="hero-shade-frozen"
            fill="var(--wx-snow)"
          />
          <rect
            x="0"
            y={Y(flFeat)}
            width={W}
            height={H - Y(flFeat)}
            className="hero-shade-warm"
            fill="var(--below-fl)"
          />

          {/* sky / atmosphere split at freezing level */}
          <rect x="0" y="0" width={W} height={Y(flFeat)} fill={`url(#${skyG})`} opacity="0.55" />

          {/* mountain: snow above FL, rock below FL */}
          <g clipPath={`url(#${mtnClip})`}>
            <rect x="0" y="0" width={W} height={Y(flFeat)} fill={`url(#${snowG})`} />
            <rect
              x="0"
              y={Y(flFeat)}
              width={W}
              height={H - Y(flFeat)}
              fill={`url(#${rockG})`}
            />
            <path
              d="M 200 440 L 360 120 M 300 440 L 430 150 M 470 440 L 520 130"
              stroke="var(--rock-line)"
              strokeWidth="1.5"
              opacity="0.4"
              fill="none"
            />
          </g>
          <path d={ridgePath} fill="none" stroke="var(--ridge-stroke)" strokeWidth="1.75" />

          {/* freezing-level day range band + featured line */}
          <rect
            x="0"
            y={Y(flMax)}
            width={W}
            height={Math.max(2, Y(flMin) - Y(flMax))}
            fill="var(--accent)"
            opacity="0.10"
          />
          <line
            x1="0"
            x2={W}
            y1={Y(flFeat)}
            y2={Y(flFeat)}
            stroke="var(--accent)"
            strokeWidth="2"
            strokeDasharray="2 5"
          />
          <g transform={`translate(14 ${Y(flFeat) - 10})`}>
            <rect x="0" y="-15" width={chipW} height="22" rx="4" fill="var(--accent)" />
            <text
              x="10"
              y="0"
              fontFamily="var(--mono)"
              fontSize="12"
              fontWeight="600"
              fill="#fff"
            >
              {chipText}
            </text>
          </g>

          {/* labeled elevation axis ticks (units-aware). Hidden on desktop, where the floating
              band cards overlay the right edge and already state each band's elevation. */}
          {axisTicks.map((e) => (
            <text
              key={e}
              className="hero-axis-label hero-axis-edge"
              x={W - 8}
              y={Y(e) + 4}
              textAnchor="end"
              fontFamily="var(--mono)"
              fontSize="10"
              fill="var(--muted)"
              opacity="0.85"
              stroke="var(--surface)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {fmtDist(e, dist)}
            </text>
          ))}

          {/* band reference lines + labels (summit/mid/base) */}
          {bands.map((b) => (
            <g key={b.key}>
              <line
                className="hero-refline"
                x1={sx(b.lx)}
                x2={W - 150}
                y1={Y(b.e)}
                y2={Y(b.e)}
                stroke="var(--ink)"
                strokeOpacity="0.18"
                strokeWidth="1"
                strokeDasharray="1 4"
              />
              <text
                className="hero-axis-label"
                x={sx(b.lx)}
                y={Y(b.e) - 5}
                fontFamily="var(--mono)"
                fontSize="9.5"
                fill="var(--muted)"
              >
                {b.name}
              </text>
              <circle
                cx={sx(b.lx)}
                cy={Y(b.e)}
                r="4"
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>

        {/* floating band labels (HTML over SVG, positioned by elevation %); on mobile they stack below */}
        <div className="band-cards">
        {bands.map((b, bi) => {
          const pt = precipFor(b.e);
          return (
            <div className="band-card" key={b.key} style={{ top: `calc(${cardTops[bi]}% - 26px)` }}>
              <div className="band-card-name">{b.name}</div>
              <div className="band-card-row">
                <span className="band-elev">{fmtDist(b.e, dist)}</span>
                <span className="band-temp">{fmtTemp(feat.bandTempF[b.key], temp, { withUnit: false })}°</span>
              </div>
              <div className={"band-precip pt-" + pt}>
                {pt === "snow" ? (
                  <Icons.flake size={12} />
                ) : pt === "mixed" ? (
                  <Icons.cloud size={12} />
                ) : (
                  <Icons.drop size={12} />
                )}
                {pt === "snow" ? "All snow" : pt === "mixed" ? "Mixed / near freezing" : "Rain / melt"}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* day strip + readout */}
      <div className="hero-side">
        <div className="hero-readout">
          <div className="hero-tod">
            <Segmented
              value={tod}
              onChange={setTod}
              options={[
                { value: "dawn", label: "Dawn" },
                { value: "midday", label: "Midday" },
                { value: "pm", label: "PM" },
              ]}
              ariaLabel="Featured time of day"
            />
          </div>
          <div className="hero-fl">
            {fmtDist(flFeat, dist).replace(/\s\w+$/, "")}
            <span>{dist}</span>
          </div>
          <div className="hero-fl-sub">
            Freezing level at {todLabel} — {modelLabel}
            {prov && <Provenance data={prov} loud />}
          </div>
        </div>
        <div className="hero-daystrip">
          <div className="daystrip-label">
            <span>Freezing level through the day</span>
            <span className="mono-dim">
              {fmtDist(flMin, dist)}–{fmtDist(flMax, dist)}
            </span>
          </div>
          <DayStrip
            rows={dayRows}
            dist={dist}
            valleyFt={valley}
            topFt={top}
            summitFt={summit}
            bandsFt={mountain.elevations}
            bandNames={bandNames}
            summitOffsetText={takeaway}
          />
        </div>
        <div className="hero-note">
          <Icons.eye size={14} />
          <span>
            Line sits <strong>{takeaway}</strong> — precip falls as snow above it.
          </span>
        </div>
      </div>
    </div>
  );
}
