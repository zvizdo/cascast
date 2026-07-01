import * as React from "react";
import type { Mountain } from "@/lib/types";

/* D11: single "Access" panel with labeled rows — kicker appears once at the top. */
export function AccessCards({
  permits,
  roads,
  trails,
}: {
  permits: Mountain["permits"];
  roads?: GeoJSON.FeatureCollection;
  trails?: GeoJSON.FeatureCollection;
}) {
  const roadsText = roads && roads.features.length > 0
    ? `${roads.features.length} forest road segments · ${roads.features.filter((f) => f.properties?.closed === true).length} closed near the peak`
    : "Road data unavailable for this area.";

  const trailsText = trails && trails.features.length > 0
    ? `${trails.features.length} mapped trail segments near the peak`
    : "Trail data unavailable for this area.";

  return (
    <div className="panel access-card">
      <div className="panel-head">
        <div>
          <div className="kicker">Access</div>
          <h3>Access</h3>
        </div>
      </div>

      {permits && permits.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px", color: "var(--ink-2)" }}>Permits</h4>
          {permits.map((p) => (
            <div key={p.url}>
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.label}
              </a>
              {p.note && <div className="permit-note">{p.note}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px", color: "var(--ink-2)" }}>Roads</h4>
        <p className="mono-dim" style={{ margin: 0 }}>{roadsText}</p>
      </div>

      <div>
        <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px", color: "var(--ink-2)" }}>Trails</h4>
        <p className="mono-dim" style={{ margin: 0 }}>{trailsText}</p>
      </div>
    </div>
  );
}
