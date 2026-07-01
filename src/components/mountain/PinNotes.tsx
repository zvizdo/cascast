/* PinNotes — editable trip notes bound to the LOCAL pin (lib/pins). Reads getPin(slug)?.notes,
   writes through updatePin on change; if no pin exists yet (focused via a shared link), the
   first edit creates one for this slug+target. No server persistence. */
"use client";
import * as React from "react";
import { getPin, addPin, updatePin } from "@/lib/pins";

export function PinNotes({
  slug,
  name,
  targetDate,
  zoneName,
}: {
  slug: string;
  name: string;
  targetDate: string;
  zoneName?: string;
}) {
  const [value, setValue] = React.useState<string>(() => getPin(slug)?.notes ?? "");
  const onChange = (notes: string) => {
    setValue(notes);
    if (getPin(slug)) updatePin(slug, { notes });
    else addPin({ mountainId: slug, name, targetDate, notes });
  };
  return (
    <div className="panel">
      <div className="kicker">Your notes</div>
      <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, margin: "4px 0 12px" }}>
        Plan
      </h3>
      <textarea
        aria-label="Trip notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Route, party, bail conditions…"
        rows={4}
        style={{
          width: "100%",
          resize: "vertical",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--ink-2)",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "10px 12px",
          fontFamily: "inherit",
        }}
      />
      {zoneName && (
        <div className="mono-dim" style={{ marginTop: 10, fontSize: 12 }}>
          Zone · {zoneName}
        </div>
      )}
    </div>
  );
}
