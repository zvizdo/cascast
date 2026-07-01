/* AirQualityPanel — AQI + category + dominant pollutant + 7-day sparkline + provenance.
   Renders null when airQuality is null/undefined; the parent owns skeleton/error. */
"use client";
import * as React from "react";
import { AreaSpark } from "@/components/charts/AreaSpark";
import { Provenance } from "@/components/shared/Provenance";
import { LastUpdated } from "@/components/shared/LastUpdated";
import { sourceProvenance } from "@/lib/provenance";
import type { AirQuality } from "@/lib/hazards/types";

/** Maps AQI category number to a danger-ramp CSS token. */
function aqiToken(n: number): string {
  const map: Record<number, string> = { 1: "--d1", 2: "--d2", 3: "--d3", 4: "--d4", 5: "--d4", 6: "--d5" };
  return map[n] ?? "--muted";
}

export function AirQualityPanel({ airQuality }: { airQuality: AirQuality | null | undefined }) {
  if (!airQuality) return null;

  const { aqi, categoryNumber, categoryName, parameter, reportingArea, trend, provenance } = airQuality;
  const sparkData = trend.map((t) => ({ v: t.aqi }));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">AirNow · {reportingArea}</div>
          <h3>Air quality &amp; smoke</h3>
        </div>
        <LastUpdated iso={provenance.observedAt ?? null} prefix="Observed" />
      </div>

      <div className="aqi-row">
        <div className="aqi-num" style={{ color: `var(${aqiToken(categoryNumber)})` }}>{aqi}</div>
        <div>
          <div>
            {categoryName} · {parameter}
          </div>
          {provenance.distanceMi != null && (
            <div className="mono-dim">
              Nearest monitor {Math.round(provenance.distanceMi)} mi away (valley) — the summit may differ.
            </div>
          )}
        </div>
      </div>

      {parameter === "PM2.5" && aqi >= 100 && (
        <p className="mono-dim" style={{ marginTop: 10 }}>
          Wildfire smoke likely — PM2.5 elevated.
        </p>
      )}

      {sparkData.length >= 2 && (
        <div className="snotel-trend" style={{ marginTop: 12 }}>
          <div className="mono-dim" style={{ marginBottom: 4 }}>7-day AQI trend</div>
          <AreaSpark
            data={sparkData}
            color="var(--caution)"
            ariaLabel={`7-day AQI trend, from ${sparkData[0].v} to ${sparkData[sparkData.length - 1].v}`}
          />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Provenance data={sourceProvenance(provenance)} />
      </div>
    </div>
  );
}
