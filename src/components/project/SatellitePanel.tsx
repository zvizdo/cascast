/* SatellitePanel — Copernicus Sentinel-2 snow coverage. Ported from app/detail.jsx SatellitePanel.
   Maps the prototype's {date,cloud,ageDays} mock to the real SatelliteCache
   {latestImageDate,cloudCoverPercent} (age computed here). */
import * as React from "react";
import { Icons } from "@/components/icons/icons";
import { StaleNotice } from "@/components/shared/StaleNotice";
import type { SatelliteCache } from "@/lib/types";

export interface SatellitePanelProps {
  sat: SatelliteCache | null | undefined;
  mountainName: string;
  imageUrl?: string;
}

function fmtSceneDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ageDays(iso: string): number {
  const then = new Date(`${iso}T12:00:00`).getTime();
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

export function SatellitePanel({ sat, mountainName, imageUrl }: SatellitePanelProps) {
  const [imgError, setImgError] = React.useState(false);
  React.useEffect(() => setImgError(false), [imageUrl]);
  const hasScene = !!(sat && sat.latestImageDate);
  const age = hasScene ? ageDays(sat!.latestImageDate as string) : null;
  const stale = age != null && age > 14;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">Copernicus Sentinel-2</div>
          <h3>Snow coverage</h3>
        </div>
        <Icons.satellite size={18} style={{ color: "var(--muted)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 20, alignItems: "center" }}>
        <div className="sat-tile">
          {hasScene && !imgError && imageUrl ? (
            <img
              className="sat-img"
              src={imageUrl}
              alt={`Sentinel-2 true-color scene of ${mountainName}`}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="sat-placeholder">
              <Icons.satellite size={22} style={{ marginBottom: 6 }} />
              <br />
              RGB tile
              <br />
              {mountainName}
            </div>
          )}
        </div>
        <div className="sat-meta">
          {hasScene ? (
            <>
              <div className="meta-row">
                <span className="k">Scene date</span>
                <span className="v">{fmtSceneDate(sat!.latestImageDate as string)}</span>
              </div>
              <div className="meta-row">
                <span className="k">Cloud cover</span>
                <span className="v">{sat!.cloudCoverPercent != null ? Math.round(sat!.cloudCoverPercent) : "—"}%</span>
              </div>
              <div className="meta-row">
                <span className="k">Age</span>
                <span className="v">{age} days</span>
              </div>
              {stale ? (
                <StaleNotice dateLabel={fmtSceneDate(sat!.latestImageDate as string)} ageDays={age!} />
              ) : (
                <div className="note-card" style={{ marginTop: 4 }}>
                  Recent cloud-free scene. Snowline is visible down to valley floor across the massif.
                </div>
              )}
            </>
          ) : (
            <div className="note-card">No recent cloud-free scene available yet for this peak.</div>
          )}
          <div className="mono-dim" style={{ fontSize: 11, marginTop: 4 }}>
            {sat?.attribution ?? "Sentinel-2 cloudless — EOX"}
          </div>
        </div>
      </div>
    </div>
  );
}
