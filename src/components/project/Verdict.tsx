/* Verdict — the lead "call" panel: tone + server-computed verdict sentence + 3 key stats.
   Ported from app/detail.jsx verdict block. Tone/verdict come from currentSummary (server). */
"use client";
import * as React from "react";
import { ConditionTone } from "@/components/shared/ConditionTone";
import { Stat } from "@/components/shared/Stat";
import { useUnits } from "@/lib/units";
import { fmtTemp, fmtWind, fmtDist } from "@/lib/units";
import type { CurrentSummary } from "@/lib/types";

export interface VerdictProps {
  summary: CurrentSummary;
  targetDateStart: string;
}

export function Verdict({ summary, targetDateStart }: VerdictProps) {
  const { temp, wind, dist } = useUnits();
  const dayLong = new Date(`${targetDateStart}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="panel verdict"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 28,
        alignItems: "center",
      }}
    >
      <div>
        <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ConditionTone tone={summary.tone} /> · The call for {dayLong}
        </div>
        <p
          style={{
            fontFamily: "var(--serif)",
            fontSize: 22,
            lineHeight: 1.45,
            margin: "10px 0 0",
            letterSpacing: "-0.01em",
            textWrap: "pretty",
          }}
        >
          {summary.verdict}
        </p>
      </div>
      <div
        className="verdict-stats"
        style={{
          display: "flex",
          gap: 26,
          paddingLeft: 28,
          borderLeft: "1px solid var(--line)",
        }}
      >
        <Stat
          label="Summit"
          value={fmtTemp(summary.targetDateHigh, temp, { withUnit: false }) + "°"}
          sub={`low ${fmtTemp(summary.targetDateLow, temp, { withUnit: false })}°`}
        />
        <Stat label="Wind" value={fmtWind(summary.targetDateWind, wind)} />
        <Stat label="Freezing" value={fmtDist(summary.freezingLevelFt, dist)} sub="at noon" />
      </div>
    </div>
  );
}
