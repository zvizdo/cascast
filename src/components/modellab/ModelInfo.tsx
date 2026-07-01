/* ModelInfo — collapsible reference describing the three forecast models shown in the Model Lab.
   Plain-language source/resolution/coverage/horizon/best-for so the chip colors aren't the only
   thing distinguishing the models. Cascast mono styling (P8 A2). */
"use client";
import * as React from "react";
import type { ModelKey } from "@/lib/forecast-select";

interface ModelDoc {
  key: ModelKey;
  label: string;
  color: string;
  source: string;
  resolution: string;
  coverage: string;
  horizon: string;
  bestFor: string;
}

const MODEL_DOCS: ModelDoc[] = [
  {
    key: "hrrr",
    label: "HRRR",
    color: "var(--accent)",
    source: "NOAA HRRR",
    resolution: "3 km",
    coverage: "CONUS only",
    horizon: "~48 h, hourly",
    bestFor: "Near-term, terrain-resolved detail.",
  },
  {
    key: "gfs",
    label: "GFS",
    color: "var(--caution)",
    source: "NOAA GFS (Open-Meteo “seamless”)",
    resolution: "13–25 km",
    coverage: "Global",
    horizon: "16 days",
    bestFor: "Reliable medium-range baseline.",
  },
  {
    key: "ecmwf",
    label: "ECMWF",
    color: "var(--good)",
    source: "ECMWF IFS",
    resolution: "9–25 km",
    coverage: "Global",
    horizon: "15 days",
    bestFor: "Strong medium-range skill.",
  },
];

export function ModelInfo({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <aside style={{ marginTop: 4 }}>
      <button
        type="button"
        className="modeltag"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--line)" }}
      >
        About the models {open ? "▲" : "▼"}
      </button>
      {open && (
        // E12: minmax(180px,1fr) so cards don't overflow a 330px panel at 360 phones
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            margin: "12px 0 0",
          }}
        >
          {MODEL_DOCS.map((m) => (
            <div
              key={m.key}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 9,
                padding: "12px 14px",
                background: "var(--surface)",
              }}
            >
              <dt
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: m.color,
                  marginBottom: 8,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: "inline-block" }} />
                {m.label}
              </dt>
              <dd style={{ margin: 0 }}>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    fontFamily: "var(--mono)",
                    fontSize: 11.5,
                    lineHeight: 1.7,
                    color: "var(--ink-2)",
                    overflowWrap: "break-word",
                  }}
                >
                  <li>
                    <span style={{ color: "var(--faint)" }}>Source </span>
                    {m.source}
                  </li>
                  <li>
                    <span style={{ color: "var(--faint)" }}>Resolution </span>
                    {m.resolution}
                  </li>
                  <li>
                    <span style={{ color: "var(--faint)" }}>Coverage </span>
                    {m.coverage}
                  </li>
                  <li>
                    <span style={{ color: "var(--faint)" }}>Horizon </span>
                    {m.horizon}
                  </li>
                  <li>
                    <span style={{ color: "var(--faint)" }}>Best for </span>
                    {m.bestFor}
                  </li>
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
