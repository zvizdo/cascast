/* NotesPanel — project plan notes + zone. Ported from app/detail.jsx inline notes panel.
   The real Project has no "party" field (prototype mock did) → Zone only. */
import * as React from "react";
import { Stat } from "@/components/shared/Stat";

export interface NotesPanelProps {
  notes: string;
  zoneName?: string;
}

export function NotesPanel({ notes, zoneName }: NotesPanelProps) {
  return (
    <div className="panel">
      <div className="kicker">Project notes</div>
      <h3
        style={{
          fontFamily: "var(--serif)",
          fontSize: 20,
          fontWeight: 500,
          margin: "4px 0 12px",
        }}
      >
        Plan
      </h3>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>
        {notes?.trim() ? notes : "No notes for this project yet."}
      </p>
      {zoneName && (
        <div
          style={{
            display: "flex",
            gap: 22,
            marginTop: 18,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
          }}
        >
          <Stat label="Zone" value={zoneName} />
        </div>
      )}
    </div>
  );
}
