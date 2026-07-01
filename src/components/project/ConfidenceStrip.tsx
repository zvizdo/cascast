/* ConfidenceStrip — model-agreement summary for the target day. Ported from app/detail.jsx
   ConfidenceStrip, extended per the P5 awareness note (CLAUDE.md): it MUST surface model
   disagreement so users see low-confidence numbers — summit-high spread, freezing-level spread
   across models, ECMWF's missing freezing-level field, and the freezing-level-vs-summit-temp
   inconsistency (e.g. GFS reading a freezing level above the summit while it is freezing there). */
"use client";
import * as React from "react";
import { DrillLink } from "@/components/shared/DrillLink";
import { Icons } from "@/components/icons/icons";
import { useUnits, fmtTemp, fmtDist } from "@/lib/units";
import {
  targetDayHigh,
  modelSpread,
  targetRows,
  noonRow,
  modelLabel,
  chooseTargetModel,
  type ModelKey,
} from "@/lib/forecast-select";
import { weatherProvenance, toProvenanceData } from "@/lib/provenance";
import { Provenance } from "@/components/shared/Provenance";
import type { CombinedForecastBlob, Mountain } from "@/lib/types";

export interface ConfidenceStripProps {
  blob: CombinedForecastBlob;
  targetDate: string;
  /** Mountain slug — used to build the Model Lab drill href. */
  slug: string;
  mountain: Pick<Mountain, "elevations">;
}

const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--accent)" },
  { key: "gfs", label: "GFS", color: "var(--caution)" },
  { key: "ecmwf", label: "ECMWF", color: "var(--good)" },
];

// A summit-temp at/below this (°F) makes a freezing level *above the summit* internally inconsistent.
const FREEZING_TEMP_F = 34;
// Freezing-level disagreement threshold (feet) across models.
const FL_SPREAD_FT = 2000;

/** Noon freezing level (ft) for a model on the target day; null if model/field absent. */
function flNoonFor(blob: CombinedForecastBlob, targetDate: string, key: ModelKey): number | null {
  const noon = noonRow(targetRows(blob[key], targetDate));
  return noon?.fl ?? null;
}

/** Noon summit temp (°F) for a model on the target day; null if model/field absent. */
function summitTempNoon(blob: CombinedForecastBlob, targetDate: string, key: ModelKey): number | null {
  const noon = noonRow(targetRows(blob[key], targetDate));
  return noon?.bandTempF.summit ?? null;
}

export function ConfidenceStrip({ blob, targetDate, slug, mountain }: ConfidenceStripProps) {
  const { temp, dist } = useUnits();

  // --- agreement on the target-day summit high ---
  // modelSpread's extractor is (b, k, d); targetDayHigh is (b, d, k) — adapt the order.
  const spreadF = Math.round(modelSpread(blob, targetDate, (b, k, d) => targetDayHigh(b, d, k)));
  // A spread is a *difference*, so convert it as a delta (×5/9 only — no +32 offset),
  // not via the absolute convTemp. Matches ModelCharts.
  const spreadDelta = temp === "C" ? Math.round((spreadF * 5) / 9) : Math.round(spreadF);
  const conf = spreadF <= 6 ? "High" : spreadF <= 14 ? "Moderate" : "Low";
  const cColor =
    conf === "High" ? "var(--good)" : conf === "Moderate" ? "var(--caution)" : "var(--alert)";

  // --- freezing-level disagreement diagnostics (P5 awareness) ---
  const summit = mountain.elevations.summit;
  const flags: React.ReactNode[] = [];

  // (a) a model that puts the freezing level above the summit while it's freezing there
  for (const { key, label } of MODELS) {
    const fl = flNoonFor(blob, targetDate, key);
    const st = summitTempNoon(blob, targetDate, key);
    if (fl != null && st != null && fl > summit && st <= FREEZING_TEMP_F) {
      flags.push(
        <li key={`incons-${key}`}>
          <strong>{label}</strong> puts the freezing level{" "}
          <strong>above the summit</strong> ({fmtDist(fl, dist)}) while its summit temp is{" "}
          {fmtTemp(st, temp)} — internally inconsistent; treat that height with suspicion.
        </li>,
      );
    }
  }

  // (b) models disagree widely on the freezing-level height
  const flSpread = modelSpread(blob, targetDate, (b, k, d) => flNoonFor(b, d, k));
  if (flSpread >= FL_SPREAD_FT) {
    flags.push(
      <li key="fl-spread">
        Models disagree on the <strong>freezing level</strong> by{" "}
        <strong>{fmtDist(flSpread, dist)}</strong> across the available runs — the single number is
        low-confidence.
      </li>,
    );
  }

  // (c) an available model that simply lacks a freezing-level field (ECMWF)
  for (const { key, label } of MODELS) {
    const available = blob[key]?.available !== false && blob[key] != null;
    if (available && flNoonFor(blob, targetDate, key) == null) {
      flags.push(
        <li key={`missing-${key}`}>
          <strong>{label}</strong> provides <strong>no freezing-level</strong> field, so it cannot
          corroborate the height.
        </li>,
      );
    }
  }

  return (
    <div className="panel conf-strip" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26,
          flexWrap: "wrap",
        }}
      >
        <div className="conf-lead">
          <div
            className="kicker"
            style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <span>Forecast confidence</span>
            <Provenance
              data={toProvenanceData(
                weatherProvenance(blob, chooseTargetModel(blob, targetDate)),
              )}
            />
          </div>
          <div className="conf-head">
            <span className="tone-dot" style={{ background: cColor }} />
            <span>{flags.length > 0 ? `${conf} agreement on temperature` : `${conf} agreement`}</span>
          </div>
          <div className="conf-sub">
            {`Models sit within ${spreadDelta}° on the target-day summit high. ${
              conf === "Low" ? "Treat the forecast as a range." : "Solid enough to plan around."
            }`}
          </div>
        </div>
        <div className="conf-models">
          {MODELS.map(({ key, label, color }) => {
            const high = targetDayHigh(blob, targetDate, key);
            return (
              <div key={key} className="conf-model">
                <span
                  className="modeltag"
                  style={{
                    background: `color-mix(in srgb, ${color} 14%, var(--surface))`,
                    color,
                  }}
                >
                  {label}
                </span>
                <span className="conf-val">{high == null ? "n/a" : fmtTemp(high, temp)}</span>
              </div>
            );
          })}
        </div>
        <DrillLink
          href={`/mountains/${slug}/models?target=${targetDate}`}
          icon={<Icons.sliders size={15} />}
        >
          Compare all models →
        </DrillLink>
      </div>

      {flags.length > 0 && (
        <div
          data-testid="confidence-flags"
          className="note-card"
          style={{ marginTop: 4, display: "flex", gap: 10 }}
        >
          <Icons.eye size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--caution)" }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Why this number is uncertain</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>{flags}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
