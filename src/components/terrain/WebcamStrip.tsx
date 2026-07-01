"use client";
import * as React from "react";
import type { Mountain } from "@/lib/types";

interface Props {
  webcams: Mountain["webcams"];
  now?: number;
}

function WebcamCard({ cam, cacheBust }: { cam: NonNullable<Mountain["webcams"]>[number]; cacheBust: number }) {
  const [errored, setErrored] = React.useState(false);

  if (cam.seasonal) {
    return (
      <figure className="webcam-card">
        <div className="mono-dim" style={{ padding: "8px 0", fontSize: 12 }}>offline (seasonal)</div>
        <figcaption style={{ fontSize: 12 }}>
          <span>{cam.label}</span>
          {" · "}
          <span className="mono-dim">{cam.source}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="webcam-card">
      {errored ? (
        <div className="mono-dim" style={{ padding: "8px 0", fontSize: 12 }}>image unavailable</div>
      ) : (
        <img
          src={`${cam.url}?t=${cacheBust}`}
          alt={`${cam.label} webcam`}
          loading="lazy"
          onError={() => setErrored(true)}
        />
      )}
      <figcaption style={{ fontSize: 12 }}>
        <span>{cam.label}</span>
        {" · "}
        <span className="mono-dim">{cam.source}</span>
      </figcaption>
    </figure>
  );
}

export function WebcamStrip({ webcams, now }: Props) {
  const cacheBust = now ?? Date.now();

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="kicker">WEBCAMS</div>
          <h3>Live webcams</h3>
        </div>
      </div>

      {!webcams || webcams.length === 0 ? (
        <p className="mono-dim">No webcam available for this peak.</p>
      ) : (
        /* D12: wrapper provides the right-edge scroll-fade affordance */
        <div className="webcam-strip-wrap">
          <div className="webcam-strip">
            {webcams.map((cam) => (
              <WebcamCard key={cam.id} cam={cam} cacheBust={cacheBust} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
