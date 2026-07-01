/* Create — Pin a Peak flow. */
(function () {
  const { Icons, UI } = window;
  const fmt = (n) => Math.round(n).toLocaleString();

  function Create({ go }) {
    const mountains = window.MWX.MOUNTAINS;
    const [q, setQ] = React.useState("");
    const [chosen, setChosen] = React.useState(null);
    const [open, setOpen] = React.useState(false);
    const [name, setName] = React.useState("");
    const [start, setStart] = React.useState("2026-02-14");
    const [end, setEnd] = React.useState("2026-02-15");
    const [notes, setNotes] = React.useState("");

    const results = mountains.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
    const pick = (m) => { setChosen(m); setQ(m.name); setOpen(false); if (!name) setName(`${m.name.replace("Mount ", "")} — Winter Objective`); };

    const valid = chosen && name && start && end;

    return (
      <div className="page">
        <button className="btn btn-ghost btn-sm" onClick={() => go("dashboard")} style={{ marginBottom: 24 }}>
          <Icons.arrowLeft size={15} /> Projects
        </button>
        <div className="create-wrap">
          <div className="kicker">New project</div>
          <h1 className="page-title" style={{ marginBottom: 6 }}>Pin a peak</h1>
          <p className="page-sub" style={{ marginBottom: 34 }}>Choose a mountain and a target window. Cirque refreshes weather, avalanche, and snowpack data for it automatically in the background.</p>

          <div className="field">
            <label>Mountain <span className="hint">— search Washington peaks</span></label>
            {chosen && !open ? (
              <div className="mtn-chosen">
                <div className="mtn-opt-ico"><Icons.mountain size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div className="mtn-opt-name">{chosen.name}</div>
                  <div className="mtn-opt-meta">{chosen.region} · summit {fmt(chosen.elevations.summit)} ft · {chosen.nwacZone}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setChosen(null); setQ(""); }}>Change</button>
              </div>
            ) : (
              <div className="mtn-search">
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 13, top: 12, color: "var(--muted)" }}><Icons.search size={18} /></span>
                  <input className="input" style={{ paddingLeft: 42 }} placeholder="Mount Rainier, Baker, Shuksan…"
                    value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoFocus />
                </div>
                {open && (
                  <div className="mtn-results">
                    {results.length ? results.map((m) => (
                      <button key={m.id} className="mtn-opt" onClick={() => pick(m)}>
                        <div className="mtn-opt-ico"><Icons.mountain size={18} /></div>
                        <div style={{ flex: 1 }}>
                          <div className="mtn-opt-name">{m.name}</div>
                          <div className="mtn-opt-meta">{m.region} · {fmt(m.elevations.summit)} ft</div>
                        </div>
                        <Icons.arrowRight size={16} style={{ color: "var(--accent)" }} />
                      </button>
                    )) : <div style={{ padding: 16, color: "var(--muted)", fontSize: 14 }}>No peaks match “{q}”.</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="field">
            <label>Project name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Camp Muir — Winter Skills" />
          </div>

          <div className="field">
            <label>Target window <span className="hint">— up to 14 days out</span></label>
            <div className="dates">
              <input className="input" type="date" value={start} min="2026-02-12" max="2026-02-26" onChange={(e) => setStart(e.target.value)} />
              <input className="input" type="date" value={end} min={start} max="2026-02-26" onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Notes <span className="hint">— optional</span></label>
            <textarea className="input" rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Route, party, contingencies…" style={{ resize: "vertical", lineHeight: 1.5 }} />
          </div>

          <div className="create-foot">
            <div className="note-card" style={{ flex: 1, margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
              <Icons.clock size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
              New projects show a “pending first refresh” state until the next hourly cycle picks them up.
            </div>
            <button className="btn btn-primary" disabled={!valid}
              style={{ opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}
              onClick={() => valid && go(chosen.id === "mt-rainier" ? "detail" : "dashboard", chosen.id === "mt-rainier" ? { id: "rainier-muir-feb" } : {})}>
              <Icons.pin size={16} /> Pin project
            </button>
          </div>
        </div>
      </div>
    );
  }

  Object.assign(window, { Create });
})();
