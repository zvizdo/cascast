/* HourlyGrid — MOS/aviation-style monospace hourly table for the target day.
   Ported from app/modellab.jsx HourlyGrid. Default model GFS (HRRR rarely reaches the target).
   Cold/hot cell thresholds compare in canonical °F before formatting; displayed values convert. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import { useUnits, convTemp, convWind, convDist } from "@/lib/units";
import { windSeverity } from "@/lib/severity";
import { targetRows, type ModelKey, type HourRow } from "@/lib/forecast-select";
import type { CombinedForecastBlob } from "@/lib/types";

export interface HourlyGridProps {
  blob: CombinedForecastBlob;
  targetDate: string;
  bandNames?: { base: string; mid: string; summit: string };
}

const MODEL_OPTIONS: { value: ModelKey; label: string }[] = [
  { value: "hrrr", label: "HRRR" },
  { value: "gfs", label: "GFS" },
  { value: "ecmwf", label: "ECMWF" },
];

const DEFAULT_BAND_NAMES = { base: "Base", mid: "Mid", summit: "Summit" };

const COLD_F = 15;
const HOT_F = 40;

export function HourlyGrid({ blob, targetDate, bandNames = DEFAULT_BAND_NAMES }: HourlyGridProps) {
  const { temp, wind, dist } = useUnits();
  const [model, setModel] = React.useState<ModelKey>("gfs");

  const rows = targetRows(blob[model], targetDate);
  const windUnit = wind === "kmh" ? "km/h" : "mph";

  const tcell = (f: number | null, key: string) => {
    if (f == null) return <td key={key}>—</td>;
    const cold = f <= COLD_F;
    const hot = f >= HOT_F;
    const cls = cold ? "cell-cold" : hot ? "cell-hot" : "";
    // Non-color signal: a glyph + aria-label so the cold/hot state isn't conveyed by color alone.
    // E9: distinct glyph for hot-temp (▲ thaw) vs high-wind (⚡) — not the same symbol
    const glyph = cold ? "❄" : hot ? "▲" : "";
    const label = cold ? "below freezing" : hot ? "above thaw" : undefined;
    return (
      <td key={key} className={cls} aria-label={label ? `${convTemp(f, temp)}, ${label}` : undefined}>
        {glyph && <span aria-hidden className="cell-flag">{glyph} </span>}
        {convTemp(f, temp)}
      </td>
    );
  };

  // E2: detect real horizontal overflow and toggle data-overflow so the CSS fade only fires then.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      if (el.scrollWidth > el.clientWidth) {
        el.setAttribute("data-overflow", "");
      } else {
        el.removeAttribute("data-overflow");
      }
    };
    update();
    // ResizeObserver may not be available in test environments (jsdom)
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  return (
    <div>
      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em" }}>
          {targetDate}
        </span>
        <Segmented value={model} onChange={setModel} options={MODEL_OPTIONS} ariaLabel="Grid model" />
      </h3>

      {rows.length === 0 ? (
        <p className="mono-dim" style={{ fontSize: 12, margin: "12px 0 0" }}>
          HRRR does not extend to the target date (0–48 h only). Switch to GFS or ECMWF.
        </p>
      ) : (
        <div ref={scrollRef} className="grid-scroll" style={{ marginTop: 12 }}>
          <table className="grid-table">
            <thead>
              <tr>
                <th className="rowlbl" scope="col">Hour</th>
                {rows.map((r) => (
                  <th key={r.t} scope="col">{String(r.hour).padStart(2, "0")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="is-target">
                <th scope="row" className="rowlbl">{`Temp · ${bandNames.summit}`}</th>
                {rows.map((r) => tcell(r.bandTempF.summit, r.t))}
              </tr>
              <Row label={`Temp · ${bandNames.mid}`} rows={rows} render={(r) => tcell(r.bandTempF.mid, r.t)} />
              <Row label={`Temp · ${bandNames.base}`} rows={rows} render={(r) => tcell(r.bandTempF.base, r.t)} />
              <Row
                label={`Wind ${windUnit}`}
                rows={rows}
                render={(r) => {
                  const high = r.windMph >= 45;
                  const sev = windSeverity(r.windMph);
                  return (
                    <td
                      key={r.t}
                      className={`${high ? "cell-hot" : ""} sev-${sev}`.trim()}
                      aria-label={high ? `${convWind(r.windMph, wind)}, high wind` : undefined}
                    >
                      {/* E9: ⚡ for high-wind, distinct from ▲ used for above-thaw temp */}
                      {high && <span aria-hidden className="cell-flag">⚡ </span>}
                      {convWind(r.windMph, wind)}
                    </td>
                  );
                }}
              />
              <Row
                label={`Gust ${windUnit}`}
                rows={rows}
                render={(r) => {
                  const high = r.gustMph >= 60;
                  const sev = windSeverity(r.gustMph);
                  return (
                    <td
                      key={r.t}
                      className={`${high ? "cell-hot" : ""} sev-${sev}`.trim()}
                      aria-label={high ? `${convWind(r.gustMph, wind)}, high gust` : undefined}
                    >
                      {/* E9: ⚡ for high-gust, matching the wind-row glyph */}
                      {high && <span aria-hidden className="cell-flag">⚡ </span>}
                      {convWind(r.gustMph, wind)}
                    </td>
                  );
                }}
              />
              <Row
                label={`Freezing ${dist}`}
                rows={rows}
                render={(r) => (
                  <td key={r.t}>{r.fl == null ? "—" : convDist(r.fl, dist).toLocaleString("en-US")}</td>
                )}
              />
              <Row
                label="Precip in"
                rows={rows}
                render={(r) => (
                  <td key={r.t} style={{ color: r.precipIn > 0 ? "var(--accent)" : "var(--faint)" }}>
                    {r.precipIn.toFixed(2)}
                  </td>
                )}
              />
              <Row label="POP %" rows={rows} render={(r) => <td key={r.t}>{Math.round(r.pop)}</td>} />
              <Row
                label="Snow in"
                rows={rows}
                render={(r) => (
                  <td key={r.t} style={{ color: r.snowIn > 0 ? "var(--accent)" : "var(--faint)" }}>
                    {r.snowIn.toFixed(1)}
                  </td>
                )}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  rows,
  render,
}: {
  label: string;
  rows: HourRow[];
  render: (r: HourRow) => React.ReactNode;
}) {
  return (
    <tr>
      <th scope="row" className="rowlbl">{label}</th>
      {rows.map((r) => render(r))}
    </tr>
  );
}
