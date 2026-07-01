/* VolcanoPanel — USGS HANS alert level + color code + threat classification + notice link.
   Renders null when volcano is null/undefined; the parent owns skeleton/error. */
"use client";
import * as React from "react";
import { Provenance } from "@/components/shared/Provenance";
import { LastUpdated } from "@/components/shared/LastUpdated";
import { sourceProvenance } from "@/lib/provenance";
import type { VolcanoStatus } from "@/lib/hazards/types";

/** Maps USGS color code to the danger-ramp CSS token. Case-insensitive. */
function colorToken(colorCode: string): string {
  switch (colorCode.toUpperCase()) {
    case "GREEN":  return "--d1";
    case "YELLOW": return "--d2";
    case "ORANGE": return "--d3";
    case "RED":    return "--d4";
    default:       return "--muted";
  }
}

export function VolcanoPanel({ volcano }: { volcano: VolcanoStatus | null | undefined }) {
  if (!volcano) return null;

  const { alertLevel, colorCode, nvewsThreat, noticeUrl, provenance } = volcano;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">USGS HANS</div>
          <h3>Volcano status</h3>
        </div>
        <LastUpdated iso={provenance.observedAt ?? null} prefix="Updated" />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          className="dot"
          style={{ background: `var(${colorToken(colorCode)})`, width: 12, height: 12, marginTop: 4, flexShrink: 0 }}
          aria-hidden="true"
        />
        <div>
          <div>
            <b>{alertLevel} / {colorCode}</b>
          </div>
          {nvewsThreat ? (
            <div className="muted">{nvewsThreat} volcano</div>
          ) : (
            <div className="muted">No current activity above background.</div>
          )}
          {noticeUrl && (
            <a
              href={noticeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="drill-link"
            >
              latest notice →
            </a>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Provenance data={sourceProvenance(provenance)} />
      </div>
    </div>
  );
}
