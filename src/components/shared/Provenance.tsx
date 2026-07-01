// src/components/shared/Provenance.tsx
"use client";
import * as React from "react";
import Link from "next/link";

export interface ProvenanceData {
  label: string;
  reason: string;
  meta?: string; // e.g. "22 mi · 18 min ago"
  href?: string; // defaults to /sources
}

export function Provenance({ data, loud = false }: { data: ProvenanceData; loud?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const aria = `${data.label} — ${data.reason}${data.meta ? ` (${data.meta})` : ""}`;
  return (
    <span
      className="prov"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="prov-tag"
        aria-label={aria}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {data.label} <span aria-hidden className="prov-i">ⓘ</span>
      </button>
      {loud && <span className="prov-reason-inline">{data.reason}</span>}
      {open && (
        <span className="prov-pop" role="note">
          {data.reason}
          {data.meta ? <span className="prov-meta"> · {data.meta}</span> : null}{" "}
          <Link href={data.href ?? "/sources"} className="prov-link">Models &amp; sources →</Link>
        </span>
      )}
    </span>
  );
}
