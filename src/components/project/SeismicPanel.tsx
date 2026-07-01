/* SeismicPanel — USGS ComCat recent earthquakes + swarm badge.
   Renders null when seismic is null/undefined; the parent owns skeleton/error. */
"use client";
import * as React from "react";
import { Provenance } from "@/components/shared/Provenance";
import { LastUpdated } from "@/components/shared/LastUpdated";
import { sourceProvenance } from "@/lib/provenance";
import { formatTimeAgo } from "@/lib/format";
import type { SeismicSummary, QuakeEvent } from "@/lib/hazards/types";

function EventRow({ event }: { event: QuakeEvent }) {
  return (
    <div className="evt">
      <span className="evt-place">
        M{event.mag} · {event.place} · {Math.round(event.depthKm)} km deep
      </span>
      <span className="mono-dim" style={{ whiteSpace: "nowrap" }}>
        {formatTimeAgo(event.time)}
      </span>
    </div>
  );
}

export function SeismicPanel({ seismic }: { seismic: SeismicSummary | null | undefined }) {
  if (!seismic) return null;

  const { count30d, largestMag, swarm, events, provenance } = seismic;
  const displayEvents = events.slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">USGS ComCat · 30 km · 30 days</div>
          <h3>Recent earthquakes</h3>
        </div>
        <LastUpdated iso={provenance.observedAt ?? null} prefix="Updated" />
      </div>

      {count30d === 0 ? (
        <p className="mono-dim">No recent earthquakes within ~30 km.</p>
      ) : (
        <>
          <div className="mono-dim" style={{ marginBottom: 10 }}>
            {count30d} events in 30 days within ~30 km
            {largestMag != null && <> · largest M{largestMag}</>}
          </div>

          {displayEvents.map((evt, i) => (
            <EventRow key={i} event={evt} />
          ))}

          <div style={{ marginTop: 10 }}>
            {swarm ? (
              <span
                className="swarm-badge"
                aria-label="earthquake swarm — elevated activity"
                title="earthquake swarm — elevated activity"
              >
                Swarm
              </span>
            ) : (
              <div className="mono-dim">
                {count30d} events this month — near the normal baseline. No swarm.
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <Provenance data={sourceProvenance(provenance)} />
      </div>
    </div>
  );
}
