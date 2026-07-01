/* Dashboard — at-a-glance project cards. */
(function () {
  const { Icons, WeatherIcon, UI } = window;
  const { ToneDot, TONE_LABEL, DangerChip, PrecipChip, fmtRange, fmtRefreshed } = UI;
  const fmt = (n) => Math.round(n).toLocaleString();

  function ProjectCard({ project, go }) {
    const s = window.MWX.summarize(project);
    const { mountain, day, nwac, snotel, tone } = s;
    return (
      <button className="proj-card" onClick={() => go("detail", { id: project.id })}>
        <div className="pc-top">
          <div>
            <div className="pc-mtn"><Icons.mountain size={13} /> {mountain.region}</div>
            <div className="pc-name">{project.name}</div>
          </div>
          <span className={"pc-tone " + tone}><ToneDot tone={tone} /> {TONE_LABEL[tone]}</span>
        </div>

        <div className="pc-cond">
          <div className="pc-cond-ico"><WeatherIcon code={day.code} size={24} /></div>
          <div className="pc-cond-main">
            <div className="pc-cond-temp">{day.high}° <span style={{ color: "var(--muted)", fontSize: "0.7em" }}>/ {day.low}°</span></div>
            <div className="pc-cond-meta">{mountain.bandNames.summit} · {fmt(mountain.elevations.summit)} ft</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <PrecipChip type={s.precipType} />
            <div className="pc-cond-meta" style={{ marginTop: 4 }}><Icons.wind size={12} style={{ verticalAlign: -2 }} /> {day.maxWind} g{day.maxGust}</div>
          </div>
        </div>

        <div className="pc-stats">
          <div className="pc-stat">
            <div className="stat-label">Freezing</div>
            <div className="stat-value">{(s.freezeNoon / 1000).toFixed(1)}<span className="stat-unit">k ft</span></div>
          </div>
          <div className="pc-stat">
            <div className="stat-label">Max wind</div>
            <div className="stat-value">{day.maxWind}<span className="stat-unit">mph</span></div>
          </div>
          <div className="pc-stat">
            <div className="stat-label">Snowpack</div>
            <div className="stat-value" style={{ color: snotel.pct >= 90 ? "var(--good)" : snotel.pct >= 70 ? "var(--caution)" : "var(--alert)" }}>{snotel.pct}<span className="stat-unit">% med</span></div>
          </div>
        </div>

        <div className="pc-danger">
          <DangerChip level={nwac.today.high} />
          <span className="mono-dim">upper · {nwac.zone}</span>
        </div>

        <div className="pc-foot">
          <span className="pc-dates"><Icons.calendar size={14} /> {fmtRange(project.targetStart, project.targetEnd)}</span>
          <span className="pc-arrow"><Icons.arrowRight size={18} /></span>
        </div>
      </button>
    );
  }

  function AddCard({ go }) {
    return (
      <button className="proj-card" onClick={() => go("create")}
        style={{ border: "1.5px dashed var(--line-strong)", background: "var(--surface-2)", alignItems: "center", justifyContent: "center", minHeight: 260, color: "var(--muted)", boxShadow: "none" }}>
        <div style={{ textAlign: "center" }}>
          <div className="empty-ico" style={{ width: 48, height: 48, borderRadius: 13, marginBottom: 12 }}><Icons.pin size={22} /></div>
          <div style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 15 }}>Pin a peak</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>Track a new objective</div>
        </div>
      </button>
    );
  }

  function Dashboard({ go }) {
    const projects = window.MWX.PROJECTS;
    return (
      <div className="page">
        <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div className="kicker">Washington Cascades · Winter</div>
            <h1 className="page-title">Your projects</h1>
            <p className="page-sub">Every pinned objective, refreshed in the background. One glance tells you whether the window is on.</p>
          </div>
          <div className="mono-dim" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icons.refresh size={14} /> Updated {fmtRefreshed(window.MWX.NOW.toISOString())}
          </div>
        </div>
        <div className="proj-grid">
          {projects.map((p) => <ProjectCard key={p.id} project={p} go={go} />)}
          <AddCard go={go} />
        </div>
      </div>
    );
  }

  Object.assign(window, { Dashboard });
})();
