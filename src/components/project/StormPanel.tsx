/* StormPanel — NWS active warnings + SPC Day-1 categorical + quiet "no storm" state.
   Renders null when alerts is null/undefined; the parent owns skeleton/error. */
"use client";
import * as React from "react";
import { Provenance } from "@/components/shared/Provenance";
import { LastUpdated } from "@/components/shared/LastUpdated";
import { sourceProvenance } from "@/lib/provenance";
import type { StormAlerts, StormAlert } from "@/lib/hazards/types";

/** Maps NWS severity to a CSS token for the tone dot. */
function severityToken(severity: string): string {
  if (severity === "Extreme" || severity === "Severe") return "--alert";
  if (severity === "Moderate") return "--caution";
  return "--muted";
}

function ExpiresNote({ expires }: { expires: string | null }) {
  if (!expires) return null;
  const label = new Date(expires).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return <span className="mono-dim"> · Until {label}</span>;
}

function AlertRow({ alert }: { alert: StormAlert }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 8 }}>
      <span
        className="dot"
        style={{ background: `var(${severityToken(alert.severity)})` }}
        aria-hidden="true"
      />
      <div>
        <div>
          <strong>{alert.event}</strong>
          <ExpiresNote expires={alert.expires} />
        </div>
        {alert.headline && <div className="mono-dim">{alert.headline}</div>}
      </div>
    </div>
  );
}

export function StormPanel({ alerts }: { alerts: StormAlerts | null | undefined }) {
  if (!alerts) return null;

  const { nws, spc, provenance } = alerts;
  const isQuiet = nws.length === 0 && spc === null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">NWS + SPC</div>
          <h3>Storm &amp; lightning risk</h3>
        </div>
        <LastUpdated iso={provenance.observedAt ?? null} prefix="Updated" />
      </div>

      {isQuiet ? (
        <p className="mono-dim">No active storm risk.</p>
      ) : (
        <>
          {nws.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
          {spc && (
            <div className="muted" style={{ marginTop: nws.length > 0 ? 8 : 0 }}>
              SPC Day-1: <b>{spc.label2}</b>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <Provenance data={sourceProvenance(provenance)} />
      </div>
    </div>
  );
}
