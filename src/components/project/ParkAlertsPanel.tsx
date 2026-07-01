/* ParkAlertsPanel — NPS alerts color-coded by category.
   Renders null when parkAlerts is null/undefined; the parent owns skeleton/error. */
"use client";
import * as React from "react";
import { Provenance } from "@/components/shared/Provenance";
import { LastUpdated } from "@/components/shared/LastUpdated";
import { sourceProvenance } from "@/lib/provenance";
import type { ParkAlerts, ParkAlert } from "@/lib/hazards/types";

function categoryToken(category: string): string {
  switch (category) {
    case "Danger":      return "--d4";
    case "Closure":     return "--d3";
    case "Caution":     return "--d2";
    case "Information": return "--accent";
    default:            return "--muted";
  }
}

function AlertRow({ alert }: { alert: ParkAlert }) {
  const token = categoryToken(alert.category);
  return (
    <div className="evt">
      <span className="evt-place" style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="dot" style={{ background: `var(${token})`, flexShrink: 0 }} aria-hidden="true" />
        <span data-category style={{ color: `var(${token})` }}>{alert.category}</span>
        <a
          href={alert.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {alert.title}
        </a>
      </span>
    </div>
  );
}

export function ParkAlertsPanel({ parkAlerts }: { parkAlerts: ParkAlerts | null | undefined }) {
  if (!parkAlerts) return null;

  const { alerts, provenance } = parkAlerts;
  const parkCode = alerts.length > 0 ? alerts[0].parkCode : null;
  const kicker = parkCode ? `NPS · ${parkCode.toUpperCase()}` : "NPS";

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">{kicker}</div>
          <h3>Park alerts &amp; closures</h3>
        </div>
        <LastUpdated iso={provenance.observedAt ?? null} prefix="Updated" />
      </div>

      {alerts.length === 0 ? (
        <p className="mono-dim">No active park alerts.</p>
      ) : (
        alerts.map((alert, i) => (
          <AlertRow key={i} alert={alert} />
        ))
      )}

      <div style={{ marginTop: 14 }}>
        <Provenance data={sourceProvenance(provenance)} />
      </div>
    </div>
  );
}
