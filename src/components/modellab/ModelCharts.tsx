/* ModelCharts — four multi-model overlay charts (temp / wind / freezing / precip) with
   disagreement flags. Ported from app/modellab.jsx lines 64–77 + ChartPanel. Series are
   converted to the active unit upstream so axis ticks + flags read in the displayed unit. */
"use client";
import * as React from "react";
import { LineChart, type Series, type SeriesPoint } from "@/components/charts/LineChart";
import { BarChart, type BarDatum } from "@/components/charts/BarChart";
import { Icons } from "@/components/icons/icons";
import { useUnits, convTemp, convWind, convDist } from "@/lib/units";
import { windSeverity } from "@/lib/severity";
import { rowsFor, modelSpread, targetDayHigh, type ModelKey, type HourRow } from "@/lib/forecast-select";
import type { CombinedForecastBlob } from "@/lib/types";

export interface ModelChartsProps {
  blob: CombinedForecastBlob;
  targetDate: string;
  active: Record<ModelKey, boolean>;
}

const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--accent)" },
  { key: "gfs", label: "GFS", color: "var(--caution)" },
  { key: "ecmwf", label: "ECMWF", color: "var(--good)" },
];

const fmtDayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });

/** Build one Series per model from a row→value accessor over the shared (row-index) x-space.
   x is the row index so every model lines up on the same time axis; null values are kept as gaps
   (rendered as line breaks, not interpolated across). */
function seriesFor(
  blob: CombinedForecastBlob,
  active: Record<ModelKey, boolean>,
  accessor: (r: HourRow) => number | null,
): Series[] {
  return MODELS.map((m) => {
    const rows = rowsFor(blob[m.key]);
    const points: SeriesPoint[] = rows.map((r, i) => {
      const y = accessor(r);
      return y == null ? null : { x: i, y };
    });
    return { key: m.key, color: m.color, points, faded: !active[m.key] };
  });
}

/** Measure the CSS width of a container element; returns 640 before first measurement (SSR/desktop safe). */
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = React.useState(640);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export function ModelCharts({ blob, targetDate, active }: ModelChartsProps) {
  const { temp, wind, dist } = useUnits();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  // 640 on desktop panels (~580–640px); 420 only when the container is narrow (≤440px mobile).
  const chartW = containerWidth <= 440 ? 420 : 640;

  // The longest available model series defines the index space + day-start x-labels.
  const baseRows = React.useMemo(() => {
    const all = MODELS.map((m) => rowsFor(blob[m.key]));
    return all.reduce((a, b) => (b.length > a.length ? b : a), [] as HourRow[]);
  }, [blob]);

  const xLabels = baseRows
    .map((r, i) => (r.hour === 0 ? { i, t: fmtDayLabel(r.date) } : null))
    .filter((l): l is { i: number; t: string } => l != null);

  // Target-day index range over the base series → highlight band.
  const targetIdx = baseRows
    .map((r, i) => (r.date === targetDate ? i : -1))
    .filter((i) => i >= 0);
  const band =
    targetIdx.length > 0 ? { x0: targetIdx[0], x1: targetIdx[targetIdx.length - 1] } : null;

  // --- disagreement flags (canonical spread → converted delta in the active unit) ---
  // A spread is a *difference*, so convert it as a delta (no +32/×scale-only), not an absolute.
  const spreadTempF = modelSpread(blob, targetDate, (b, k, d) => targetDayHigh(b, d, k));
  const tempDelta = temp === "C" ? Math.round((spreadTempF * 5) / 9) : Math.round(spreadTempF);
  const tempFlag = spreadTempF > 15 ? `Δ${tempDelta}°${temp} at target` : null;

  const targetDayMaxWind = (b: CombinedForecastBlob, d: string, k: ModelKey): number | null => {
    const winds = rowsFor(b[k]).filter((r) => r.date === d).map((r) => r.windMph);
    return winds.length ? Math.max(...winds) : null;
  };
  const spreadWindMph = modelSpread(blob, targetDate, (b, k, d) => targetDayMaxWind(b, d, k));
  const windDelta = convWind(spreadWindMph, wind);
  const windUnitLabel = wind === "kmh" ? "km/h" : "mph";
  const windFlag = spreadWindMph > 20 ? `Δ${windDelta} ${windUnitLabel} at target` : null;

  // Guard null BEFORE converting: convTemp/convWind coerce null→0 and would plot a bogus
  // floor value (e.g. -18°C) instead of breaking the line where a model has no data
  // (HRRR null-pads beyond ~48h). Matches flSeries' null guard.
  const tempSeries = seriesFor(blob, active, (r) => {
    // Use the null-preserving raw fields so null-padded hours (HRRR >48h) break the line
    // instead of plotting convTemp(0)≈-18°C (num() coerces tempF→0).
    const v = r.bandTempF.summit ?? r.tempFRaw;
    return v == null ? null : convTemp(v, temp);
  });
  const windSeries = seriesFor(blob, active, (r) => (r.windMphRaw == null ? null : convWind(r.windMphRaw, wind)));
  const flSeries = seriesFor(blob, active, (r) => (r.fl == null ? null : convDist(r.fl, dist)));

  // Precip stays inches (§12a); summed per model bar over the base index space.
  const precipBars: BarDatum[] = baseRows.map((_, i) => {
    const vals = MODELS.filter((m) => active[m.key]).map((m) => {
      const rows = rowsFor(blob[m.key]);
      return rows[i]?.precipIn ?? 0;
    });
    return { v: vals.length ? Math.max(...vals) : 0 };
  });

  return (
    <>
      {/* Zero-height sentinel that spans the full column width — used by useContainerWidth to
          determine whether we're in a narrow (mobile) or wide (desktop) panel. */}
      <div ref={containerRef} style={{ height: 0, overflow: "hidden", gridColumn: "1 / -1" }} aria-hidden />
      {/* E3: responsive w — 420 when container ≤440px (mobile), 640 otherwise (desktop ~1:1) */}
      <ChartPanel title="Summit temperature" unit={`°${temp}`} flag={tempFlag}>
        <LineChart
          series={tempSeries}
          xLabels={xLabels}
          band={band}
          w={chartW}
          h={210}
          yUnit={`°${temp}`}
          ariaLabel={`Summit temperature model comparison in °${temp}`}
        />
      </ChartPanel>
      <ChartPanel title="Summit wind" unit={windUnitLabel} flag={windFlag} windThresh={convWind(45, wind)} windThreshLabel={windUnitLabel}>
        <LineChart
          series={windSeries}
          xLabels={xLabels}
          band={band}
          yMin={0}
          w={chartW}
          h={210}
          yUnit={windUnitLabel}
          ariaLabel={`Summit wind model comparison in ${windUnitLabel}`}
        />
      </ChartPanel>
      <ChartPanel title="Freezing level" unit={dist}>
        {/* E4: padLeft=56 for 5-digit freezing-level tick labels (e.g. "13451 ft") */}
        <LineChart
          series={flSeries}
          xLabels={xLabels}
          band={band}
          w={chartW}
          h={210}
          yUnit={dist}
          ariaLabel={`Freezing level model comparison in ${dist}`}
          padLeft={56}
        />
      </ChartPanel>
      <ChartPanel title="Precipitation" unit="in">
        <BarChart
          data={precipBars}
          xLabels={xLabels}
          band={band}
          h={140}
          unit="in"
          ariaLabel="Precipitation model comparison in inches"
        />
      </ChartPanel>
    </>
  );
}

function ChartPanel({
  title,
  unit,
  flag,
  windThresh,
  windThreshLabel,
  children,
}: {
  title: string;
  unit: string;
  flag?: string | null;
  windThresh?: number;
  windThreshLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lab-panel">
      <h3>
        <span>
          {title} <span style={{ color: "var(--faint)" }}>· {unit}</span>
        </span>
        {flag && (
          <span className="disagree">
            <Icons.alert size={11} style={{ verticalAlign: -1 }} /> {flag}
          </span>
        )}
      </h3>
      {children}
      <div className="chart-legend">
        {MODELS.map((m) => (
          <span className="legend-item" key={m.key}>
            <span className="legend-swatch" style={{ background: m.color }} /> {m.label}
          </span>
        ))}
        {windThresh != null && windThreshLabel != null && (
          /* E6: own line via flex-basis:100% on .wind-thresh; ⚡ prefix distinguishes from model swatches */
          <span className={`wind-thresh sev-${windSeverity(45)}`}>
            ⚡ ≥{windThresh} {windThreshLabel} high wind
          </span>
        )}
      </div>
    </div>
  );
}
