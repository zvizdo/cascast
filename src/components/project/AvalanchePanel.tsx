/* AvalanchePanel — NWAC danger + problems, with summer off-season state.
   Ported from app/detail.jsx AvalanchePanel. Maps prototype mock (today/tomorrow/zone/problems[].type/size/note/snowpack)
   to real NwacForecast (danger.current/tomorrow, zoneName, problems[].name/sizeMin..sizeMax/description, hazardDiscussion). */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";
import { DangerChip } from "@/components/shared/DangerChip";
import { OffSeasonState } from "@/components/shared/OffSeasonState";
import { DangerColumn } from "./DangerColumn";
import { AspectRose } from "./AspectRose";
import type { NwacForecast } from "@/lib/types";

export interface AvalanchePanelProps {
  nwac: NwacForecast | { season: "summer" } | null | undefined;
}

function isWinterForecast(
  n: AvalanchePanelProps["nwac"],
): n is NwacForecast {
  return !!n && (n as NwacForecast).season === "winter" && Array.isArray((n as NwacForecast).problems);
}

export function AvalanchePanel({ nwac }: AvalanchePanelProps) {
  const [open, setOpen] = React.useState(false);

  if (!isWinterForecast(nwac)) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="kicker">NWAC</div>
            <h3>Avalanche danger</h3>
          </div>
        </div>
        <OffSeasonState />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head panel-head--avy">
        <div>
          <div className="kicker">NWAC · {nwac.zoneName}</div>
          <h3>Avalanche danger</h3>
        </div>
        <DangerChip level={nwac.danger.current.upper} />
      </div>
      <div className="avy-today">
        <div>
          <div className="mono-dim" style={{ marginBottom: 8 }}>
            Today
          </div>
          <DangerColumn danger={nwac.danger.current} />
          <div className="mono-dim" style={{ margin: "16px 0 8px" }}>
            Tomorrow
          </div>
          <DangerColumn danger={nwac.danger.tomorrow} compact />
        </div>
        <div>
          <p className="bottomline">{nwac.bottomLine}</p>
        </div>
      </div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {nwac.problems.map((p) => (
          <div className="problem" key={p.problemId}>
            <div className="problem-rose">
              <AspectRose aspects={p.aspects} size={108} />
              <small>aspect / elevation</small>
            </div>
            <div className="problem-body">
              <h4>{p.name}</h4>
              <div className="problem-tags">
                <span className="ptag">{p.likelihood}</span>
                <span className="ptag">
                  Size {p.sizeMin}–{p.sizeMax}
                </span>
              </div>
              <p>{p.description}</p>
            </div>
          </div>
        ))}
      </div>
      {nwac.hazardDiscussion && (
        <>
          <button
            type="button"
            className="drill-link"
            style={{ marginTop: 16 }}
            onClick={() => setOpen((o) => !o)}
          >
            <Icons.chevron size={14} style={{ transform: open ? "rotate(90deg)" : "none" }} />{" "}
            {open ? "Hide" : "Read"} snowpack analysis
          </button>
          {open && (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 12 }}>
              {nwac.hazardDiscussion}
            </p>
          )}
        </>
      )}
    </div>
  );
}
