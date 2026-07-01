/* DailyOutlook — progressive granularity glance: Daily → AM·Mid·PM → Hourly (48h).
   Ported from app/detail.jsx DailyOutlook. Reads the combined blob's parallel arrays via lib/derive.
   All temps/winds rendered through useUnits; the ribbon Y axis converts too. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import { Select } from "@/components/shared/Select";
import { ElevationBandSelector } from "./ElevationBandSelector";
import { DrillLink } from "@/components/shared/DrillLink";
import { useBand } from "@/lib/band";
import { WeatherIcon } from "@/components/icons/WeatherIcon";
import { Icons } from "@/components/icons/icons";
import { linePath } from "@/components/charts/chart-utils";
import { WindArrow } from "@/components/icons/WindArrow";
import { useUnits, convTemp, convWind, fmtDist } from "@/lib/units";
import {
  type Band,
  type Cell,
  type Group,
  type Level,
  mixedCells,
  dayLevelDefaults,
  finerLevel,
  gridWidthMode,
  precipFor,
} from "@/lib/derive";
import { tileSeverity, windSeverity } from "@/lib/severity";
import { Provenance } from "@/components/shared/Provenance";
import { weatherProvenance, toProvenanceData } from "@/lib/provenance";
import type { CombinedForecastBlob, Mountain } from "@/lib/types";

type Zoom = Level;

// The next level a day's expander can step to, gated on what data exists.
//   day    → "period" if canPeriod, else "hour" if canHour, else undefined
//   period → "hour"   if canHour,   else undefined (collapse back to day)
//   hour   → undefined (collapse back to day)
// undefined ⇒ the control collapses to the global baseline / day. The day→hour
// skip handles the rare case of hourly data with no aggregatable period window.
function nextLevelFor(current: Level, g: Pick<Group, "canPeriod" | "canHour">): Level | undefined {
  if (current === "day") return g.canPeriod ? "period" : g.canHour ? "hour" : undefined;
  if (current === "period") return g.canHour ? "hour" : undefined;
  return undefined;
}

const RANK: Record<Level, number> = { day: 0, period: 1, hour: 2 };
const COARSER: Record<Level, Level> = { hour: "period", period: "day", day: "day" };

export interface DailyOutlookProps {
  blob: CombinedForecastBlob;
  nowIso: string;
  targetStart: string;
  targetEnd: string;
  mountain: Pick<Mountain, "elevations"> & { bandNames?: Record<Band, string> };
  modelLabHref: string;
}

const DEFAULT_BAND_NAMES: Record<Band, string> = {
  base: "Base",
  mid: "Mid",
  summit: "Summit",
};

const PRECIP_ICON = {
  flake: Icons.flake,
  drop: Icons.drop,
  cloud: Icons.cloud,
  sun: Icons.sun,
} as const;

export function DailyOutlook({
  blob,
  nowIso,
  targetStart,
  targetEnd,
  mountain,
  modelLabHref,
}: DailyOutlookProps) {
  const band = useBand((s) => s.band);
  // global baseline (the Segmented) applies to every day.
  const [globalZoom, setGlobalZoom] = React.useState<Zoom>("day");
  const { temp, wind } = useUnits();

  const gfs = blob.gfs;
  const bandNames = mountain.bandNames ?? DEFAULT_BAND_NAMES;

  // per-day overrides, seeded from the 48h auto-expand defaults; re-init when the
  // series / now / target change.
  const seed = React.useMemo<Record<string, Level>>(
    () => (gfs ? dayLevelDefaults(gfs, nowIso, targetStart, targetEnd) : {}),
    [gfs, nowIso, targetStart, targetEnd],
  );
  const [perDay, setPerDay] = React.useState<Record<string, Level>>(seed);
  React.useEffect(() => setPerDay(seed), [seed]);

  // effective level for a day = the finer of the global baseline and its override.
  const levelFor = React.useCallback(
    (d: string): Level => finerLevel(globalZoom, perDay[d] ?? globalZoom),
    [globalZoom, perDay],
  );

  // Step a day one level finer toward its next AVAILABLE level. `g.level` is the
  // day's clamped effective level, so the control never advances past what the
  // day's data supports.
  const stepUp = React.useCallback((g: Pick<Group, "dateKey" | "level" | "canPeriod" | "canHour">) => {
    const next = nextLevelFor(g.level, g);
    if (next) setPerDay((p) => ({ ...p, [g.dateKey]: next }));
  }, []);

  // Step a day one level coarser. When the target lands at/below the global
  // baseline, drop the override entirely so the day follows the baseline again.
  const stepDown = React.useCallback(
    (g: Pick<Group, "dateKey" | "level">) => {
      const target = COARSER[g.level];
      setPerDay((p) => {
        const o = { ...p };
        if (RANK[target] <= RANK[globalZoom]) delete o[g.dateKey];
        else o[g.dateKey] = target;
        return o;
      });
    },
    [globalZoom],
  );

  // Measure the scroll container so the trend SVG width always equals the
  // rendered grid width. Infinity ⇒ "stretch" on first paint (deterministic SSR).
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [cw, setCw] = React.useState(Infinity);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    setCw(el.clientWidth);
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cells, groups } = React.useMemo<{ cells: Cell[]; groups: Group[] }>(() => {
    if (!gfs) return { cells: [], groups: [] };
    return mixedCells(blob.hrrr, gfs, band, nowIso, targetStart, targetEnd, levelFor);
  }, [gfs, blob.hrrr, band, nowIso, targetStart, targetEnd, levelFor]);

  const n = cells.length;
  if (!n) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="kicker">Daily outlook</div>
            <h3>The days around your window</h3>
          </div>
        </div>
        <p className="mono-dim">Forecast pending.</p>
      </div>
    );
  }

  // Per-cell column width by the day's effective level (daily wide, hour narrow).
  // The cell's `single` flag marks hourly; `sub` (date subtitle) marks a daily cell.
  const CELL_W: Record<Level, number> = { day: 116, period: 92, hour: 48 };
  const cellLevel = (c: Cell): Level => (c.single ? "hour" : c.sub ? "day" : "period");
  const colWArr = cells.map((c) => CELL_W[cellLevel(c)]);
  const allSingle = cells.length > 0 && cells.every((c) => c.single);
  const totalW = colWArr.reduce((a, w) => a + w, 0);
  // The grid stretches to fill the container (fr columns) when it fits, else
  // scrolls at its natural px width. The trend SVG uses the SAME width so the
  // line never truncates short of the tiles.
  const mode = gridWidthMode(totalW, cw);
  const stretch = mode === "stretch";
  const wrapperW = stretch ? "100%" : totalW;
  const gridCols = colWArr.map((w) => (stretch ? `${w}fr` : `${w}px`)).join(" ");
  const firstT = cells.findIndex((c) => c.isTarget);
  const lastT = cells.map((c) => c.isTarget).lastIndexOf(true);

  // temperature ribbon — Y axis in the active temp unit. The viewBox spans the
  // total pixel width so columns of mixed widths stay aligned with the grid.
  // Only cells that have a temp contribute points; the line breaks at gaps.
  const H = 72;
  // pixel center (and left edge) of each column
  const colCenter: number[] = [];
  const colLeft: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < colWArr.length; i++) {
      colLeft.push(acc);
      colCenter.push(acc + colWArr[i] / 2);
      acc += colWArr[i];
    }
  }
  const tempIdx = cells.flatMap((c, i) => (c.hasTemp ? [i] : []));
  const his = tempIdx.map((i) => convTemp(cells[i].hi as number, temp));
  const los = tempIdx.map((i) => convTemp(cells[i].lo as number, temp));
  const hasTemps = tempIdx.length > 0;
  const mn = (hasTemps ? Math.min(...los) : 0) - 3;
  const mx = (hasTemps ? Math.max(...his) : 0) + 3;
  const X = (i: number) => colCenter[i];
  const Y = (v: number) => H - 9 - ((v - mn) / (mx - mn || 1)) * (H - 20);
  // points keyed by their column index so gaps stay gaps
  const hiPts = tempIdx.map((i, j) => ({ x: X(i), y: Y(his[j]) }));
  const loPts = tempIdx.map((i, j) => ({ x: X(i), y: Y(los[j]) }));

  // split a point list into contiguous segments (break where the column index jumps)
  const segments = (pts: { x: number; y: number }[]): { x: number; y: number }[][] => {
    const segs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    let prevCol: number | null = null;
    tempIdx.forEach((col, j) => {
      if (prevCol !== null && col !== prevCol + 1) {
        if (cur.length) segs.push(cur);
        cur = [];
      }
      cur.push(pts[j]);
      prevCol = col;
    });
    if (cur.length) segs.push(cur);
    return segs;
  };
  const hiSegs = segments(hiPts);
  const loSegs = segments(loPts);
  const hiLine = hiSegs.map((s) => linePath(s)).join(" ");
  const loLine = loSegs.map((s) => linePath(s)).join(" ");
  // shaded area per segment (hi over, lo back) so gaps don't fill
  const area = hiSegs
    .map((seg, s) => {
      const lo = loSegs[s];
      const back = lo.slice().reverse().map((p) => `L ${p.x} ${p.y}`).join(" ");
      return `${linePath(seg)} ${back} Z`;
    })
    .join(" ");

  const elevBase = `${bandNames[band]} · ${fmtDist(mountain.elevations[band], useUnits.getState().dist)}`;
  const elevSuffix = allSingle ? " · hourly temperature" : " · daytime high / overnight low";
  const elevSuffixCompact = allSingle ? " · hourly" : " · hi/low";
  const elevReadout = elevBase + elevSuffix;
  const elevReadoutCompact = elevBase + elevSuffixCompact;
  const targetX = firstT >= 0 ? colLeft[firstT] : 0;
  const targetW =
    firstT >= 0 ? colLeft[lastT] + colWArr[lastT] - colLeft[firstT] : 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">Daily outlook</div>
          <h3>The days around your window</h3>
        </div>
        <ElevationBandSelector />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="mono-dim elev-readout">
          <span className="elev-full">{elevReadout}</span>
          <span className="elev-compact">{elevReadoutCompact}</span>
        </div>
        <div className="only-desktop">
          <Segmented<Zoom>
            value={globalZoom}
            onChange={setGlobalZoom}
            ariaLabel="Zoom level"
            options={[
              { value: "day", label: "Daily" },
              { value: "period", label: "AM·Mid·PM" },
              { value: "hour", label: "Hourly" },
            ]}
          />
        </div>
        <div className="only-mobile">
          <Select<Zoom>
            value={globalZoom}
            onChange={setGlobalZoom}
            ariaLabel="Zoom level"
            options={[
              { value: "day", label: "Daily" },
              { value: "period", label: "AM·Mid·PM" },
              { value: "hour", label: "Hourly" },
            ]}
          />
        </div>
      </div>
      <div className="mono-dim" style={{ marginTop: -4, marginBottom: 10, fontSize: 11.5 }}>
        Tap a day to expand it.
      </div>

      <div className="daily">
        <div className="daily-scroll" ref={scrollRef}>
          <div style={{ width: wrapperW }}>
            <div className="daily-groups">
              {groups.map((g, i) => {
                const next = nextLevelFor(g.level, g);
                // Collapse one level toward the baseline; only when the day is
                // expanded past it. Expand to the next available finer level.
                const canCollapse = RANK[g.level] > RANK[globalZoom];
                const collapseLabel = `Collapse ${g.label} to ${COARSER[g.level] === "day" ? "daily" : "AM·Mid·PM"}`;
                const expandLabel = next
                  ? `Expand ${g.label} to ${next === "period" ? "AM·Mid·PM" : "hourly"} detail`
                  : "";
                const groupW = colWArr
                  .slice(
                    groups.slice(0, i).reduce((a, gg) => a + gg.span, 0),
                    groups.slice(0, i + 1).reduce((a, gg) => a + gg.span, 0),
                  )
                  .reduce((a, w) => a + w, 0);
                return (
                  <div
                    key={g.dateKey}
                    className={"daily-group" + (g.isTarget ? " is-target" : "")}
                    style={stretch ? { flex: `${groupW} 1 0` } : { width: groupW, flexShrink: 0 }}
                  >
                    <span className="dg-label">{g.label}</span>
                    <span className="dg-ctrls">
                      {canCollapse && (
                        <button
                          type="button"
                          className="dg-collapse"
                          onClick={() => stepDown(g)}
                          aria-label={collapseLabel}
                          title={collapseLabel}
                        >
                          <Icons.arrowLeft size={12} />
                        </button>
                      )}
                      {next && (
                        <button
                          type="button"
                          className="dg-expand"
                          onClick={() => stepUp(g)}
                          aria-label={expandLabel}
                          title={expandLabel}
                        >
                          <Icons.chevron size={12} />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <svg
              className="daily-trend"
              viewBox={`0 0 ${totalW} ${H}`}
              preserveAspectRatio="none"
              style={{ width: wrapperW }}
              role="img"
              aria-label={
                hasTemps
                  ? `Temperature trend, ${Math.round(Math.min(...los))}° to ${Math.round(Math.max(...his))}°${temp} across ${n} ${allSingle ? "hours" : "days"}`
                  : "Temperature trend pending"
              }
            >
              {firstT >= 0 && (
                <rect
                  x={targetX}
                  y="0"
                  width={targetW}
                  height={H}
                  fill="var(--target-band)"
                />
              )}
              <path d={area} fill="var(--accent)" opacity="0.07" />
              <path
                d={hiLine}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
              {!allSingle && (
                <path
                  d={loLine}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="1.75"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hiPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={allSingle ? 1.5 : 2.6} fill="var(--accent)" />
              ))}
            </svg>

            <div className="daily-grid" style={{ gridTemplateColumns: gridCols }}>
              {cells.map((c, i) => {
                const pc = precipFor(c);
                const PIcon = PRECIP_ICON[pc.icon];
                const lvl = cellLevel(c);
                const compact = lvl !== "day";
                return (
                  <div
                    key={c.key}
                    className={
                      "day-tile" +
                      ` sev-${tileSeverity(c)}` +
                      (c.isTarget ? " is-target" : "") +
                      (compact ? " compact" : "")
                    }
                  >
                    {c.isTarget && i === firstT && <span className="dt-flag">Target</span>}
                    <div className="dt-day">{c.label}</div>
                    {c.sub && <div className="dt-date">{c.sub}</div>}
                    <div className="dt-ico">
                      <WeatherIcon code={c.code} size={compact ? 18 : 26} />
                    </div>
                    <div className="dt-temp">
                      {c.hi == null ? "—" : `${convTemp(c.hi, temp)}°`}
                      {!c.single && (
                        <span className="lo"> / {c.lo == null ? "—" : `${convTemp(c.lo, temp)}°`}</span>
                      )}
                    </div>
                    {c.feelsLike != null && (
                      <div className="dt-feels mono-dim">
                        Feels like {convTemp(c.feelsLike, temp)}°
                      </div>
                    )}
                    <div className="dt-wind">
                      {c.windDir != null && (
                        <WindArrow
                          deg={c.windDir}
                          size={11}
                          aria-label={`wind from ${Math.round(c.windDir)}°`}
                        />
                      )}
                      <Icons.wind size={11} />
                      <span className={`wind-pill sev-${windSeverity(c.wind)}`}>
                        {convWind(c.wind, wind)}
                      </span>
                      {!c.single && (
                        <span style={{ color: "var(--faint)" }}>g{convWind(c.gust, wind)}</span>
                      )}
                    </div>
                    {lvl !== "hour" && (
                      <div className="dt-precip" style={{ color: `var(${pc.varName})` }}>
                        <PIcon size={11} style={{ verticalAlign: -1 }} /> {pc.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="daily-legend">
          <span>
            <span className="legend-swatch" style={{ background: "var(--accent)" }} />{" "}
            {allSingle ? "Temp" : "High"}
          </span>
          {!allSingle && (
            <span>
              <span className="legend-swatch" style={{ background: "var(--muted)" }} /> Low
            </span>
          )}
          <span>
            <span
              className="tone-dot"
              style={{ background: "var(--accent)", opacity: 0.3, borderRadius: 2, width: 16 }}
            />{" "}
            Target window
          </span>
          {cells.some((c) => c.single) && (
            <span
              className="mono-dim"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icons.clock size={12} /> Hourly detail · HRRR 3 km when available
            </span>
          )}
          <span className="mono-dim">Tint = wind + precip severity</span>
          <span className="mono-dim">
            <span className="legend-swatch" style={{ background: "var(--accent)" }} /> HRRR hrs 0–48{" "}
            <span className="legend-swatch" style={{ background: "var(--muted)" }} /> GFS beyond
          </span>
          <Provenance data={toProvenanceData(weatherProvenance(blob, "hrrr"))} />
        </div>
        <DrillLink href={modelLabHref} icon={<Icons.grid size={15} />}>
          Open full hourly grid &amp; raw data
        </DrillLink>
      </div>
    </div>
  );
}
