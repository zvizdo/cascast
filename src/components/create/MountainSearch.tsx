/* MountainSearch — typeahead over mountains; chosen card with Change. Ported from app/create.jsx. */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";
import { useUnits, fmtDist } from "@/lib/units";
import type { Mountain } from "@/lib/types";
import { track, mountainParams } from "@/lib/analytics";

export interface MountainSearchProps {
  mountains: Mountain[];
  value: Mountain | null;
  onSelect: (m: Mountain) => void;
  onClear: () => void;
  /** Suppress suggestions until the query reaches this length (default 0 = show all). */
  minQueryLength?: number;
}

export function MountainSearch({
  mountains,
  value,
  onSelect,
  onClear,
  minQueryLength = 0,
}: MountainSearchProps) {
  const dist = useUnits((s) => s.dist);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const listId = React.useId().replace(/[:]/g, "");

  const gated = q.trim().length < minQueryLength;
  const results = gated
    ? []
    : mountains.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));

  React.useEffect(() => {
    setActive(-1);
  }, [q]);

  // Debounced search-intent event (fires once the query settles).
  React.useEffect(() => {
    const len = q.trim().length;
    if (len < Math.max(1, minQueryLength)) return;
    const id = setTimeout(() => track("search_performed", { query_length: len }), 600);
    return () => clearTimeout(id);
  }, [q, minQueryLength]);

  // keep the keyboard-active option in view as the user arrows through results
  React.useEffect(() => {
    if (!open || active < 0) return;
    const opt = document.getElementById(`${listId}-opt-${results[active]?.slug}`);
    opt?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, listId, results]);

  const choose = (m: Mountain) => {
    setOpen(false);
    setQ(m.name);
    track("search_result_selected", mountainParams(m));
    onSelect(m);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => (results.length ? (a + 1) % results.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) =>
        results.length ? (a <= 0 ? results.length - 1 : a - 1) : -1,
      );
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (value && !open) {
    return (
      <div className="mtn-chosen">
        <div className="mtn-opt-ico">
          <Icons.mountain size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="mtn-opt-name">{value.name}</div>
          <div className="mtn-opt-meta">
            {value.region} · summit {fmtDist(value.elevations.summit, dist)}
            {value.nwacZone ? ` · ${value.nwacZone}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setOpen(false);
            setQ("");
            onClear();
          }}
        >
          Change
        </button>
      </div>
    );
  }

  const showList = open && !gated;
  const activeId = showList && results[active] ? `${listId}-opt-${results[active].slug}` : undefined;

  return (
    <div className="mtn-search">
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 13, top: 12, color: "var(--muted)" }}>
          <Icons.search size={18} />
        </span>
        <input
          className="input"
          style={{ paddingLeft: 42 }}
          placeholder="Mount Rainier, Baker, Shuksan…"
          value={q}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label="Search mountains"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && (
        <div className="mtn-results" id={listId} role="listbox" aria-label="Mountains">
          {results.length ? (
            results.map((m, i) => (
              <button
                key={m.slug}
                id={`${listId}-opt-${m.slug}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={"mtn-opt" + (i === active ? " active" : "")}
                onClick={() => choose(m)}
                onMouseEnter={() => setActive(i)}
              >
                <div className="mtn-opt-ico">
                  <Icons.mountain size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="mtn-opt-name">{m.name}</div>
                  <div className="mtn-opt-meta">
                    {m.region} · {fmtDist(m.elevations.summit, dist)}
                  </div>
                </div>
                <Icons.arrowRight size={16} style={{ color: "var(--accent)" }} />
              </button>
            ))
          ) : (
            <div style={{ padding: 16, color: "var(--muted)", fontSize: 14 }}>
              No peaks match “{q}”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
