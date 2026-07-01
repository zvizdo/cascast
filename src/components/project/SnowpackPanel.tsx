/* SnowpackPanel — SNOTEL depth/SWE/percent-of-median + 30-day depth spark.
   Ported from app/detail.jsx SnowpackPanel. Maps prototype {depth,swe,pct,station,elev,trend[].depth}
   to real SnotelData {current.{snowDepthIn,sweIn,percentOfMedian}, stationName, elevationFt, trend[].snowDepthIn}.
   Depth follows the height axis (contract §12a): ft → inches, m → centimeters. SWE stays inches. */
"use client";
import * as React from "react";
import { Stat } from "@/components/shared/Stat";
import { AreaSpark } from "@/components/charts/AreaSpark";
import { useUnits, fmtDist } from "@/lib/units";
import type { SnotelData } from "@/lib/types";

export interface SnowpackPanelProps {
  snotel: SnotelData | null | undefined;
}

/** Depth in inches → value + unit, tied to the height axis. */
function depthFor(inches: number, dist: "ft" | "m"): { value: number; unit: string } {
  if (dist === "m") return { value: Math.round(inches * 2.54), unit: "cm" };
  return { value: Math.round(inches), unit: "in" };
}

export function SnowpackPanel({ snotel }: SnowpackPanelProps) {
  const { dist } = useUnits();

  if (!snotel || !snotel.current) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="kicker">SNOTEL</div>
            <h3>Snowpack</h3>
          </div>
        </div>
        <p className="mono-dim">Snowpack data pending — no recent SNOTEL reading.</p>
      </div>
    );
  }

  const { current, trend, stationName, elevationFt } = snotel;
  const depth = depthFor(current.snowDepthIn ?? 0, dist);
  const pct = Math.round(current.percentOfMedian ?? 0);
  const pctColor = pct >= 90 ? "var(--good)" : pct >= 70 ? "var(--caution)" : "var(--alert)";
  const sparkData = (trend ?? [])
    .filter((t) => t.snowDepthIn != null)
    .map((t) => ({ v: depthFor(t.snowDepthIn as number, dist).value }));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">SNOTEL · {stationName}</div>
          <h3>Snowpack</h3>
        </div>
      </div>
      <div className="snotel-top">
        <Stat label="Snow depth" value={depth.value} unit={depth.unit} />
        <Stat label="SWE" value={current.sweIn != null ? current.sweIn.toFixed(1) : "—"} unit="in" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, color: pctColor }}>
          {pct}%
        </span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          of median SWE for today
          <br />
          <span className="mono-dim">
            {stationName} · {fmtDist(elevationFt, dist)}
          </span>
        </span>
      </div>
      {sparkData.length > 1 && (
        <div className="snotel-trend">
          <div className="mono-dim" style={{ marginBottom: 4 }}>
            Snow depth · last 30 days
          </div>
          <AreaSpark
            data={sparkData}
            color="var(--accent)"
            fill="var(--accent-soft)"
            h={56}
            ariaLabel={`Snow depth trend over the last 30 days, from ${Math.round(sparkData[0].v)} to ${Math.round(sparkData[sparkData.length - 1].v)} inches`}
          />
        </div>
      )}
      <div className="note-card" style={{ marginTop: 14 }}>
        SWE — snow water equivalent — is the water held in the snowpack. It’s the truest measure of
        how deep and consolidated the base is for travel and stability.
      </div>
    </div>
  );
}
