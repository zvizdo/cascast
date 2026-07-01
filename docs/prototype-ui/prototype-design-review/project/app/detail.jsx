/* Detail — the calm, interpretable layer. */
(function () {
  const { Icons, WeatherIcon, UI, FreezingLevelHero, AspectRose, Charts } = window;
  const { Segmented, DangerColumn, DangerChip, PrecipChip, fmtDate, fmtRange, fmtRefreshed, DANGER } = UI;
  const fmt = (n) => Math.round(n).toLocaleString();

  const targetRows = (det, model) => det.forecast[model].filter((r) => r && r.t.slice(0, 10) === window.MWX.TARGET);
  function chooseTargetModel(det) {
    const h = targetRows(det, "hrrr");
    return h.length ? "hrrr" : "gfs";
  }
  function dayBand(rows, dk, band) {
    const hrs = rows.filter((r) => r && r.t.slice(0, 10) === dk);
    const temps = hrs.map((r) => r.bands[band].temp);
    const winds = hrs.map((r) => r.wind);
    const noon = hrs.find((r) => new Date(r.t).getHours() === 12) || hrs[0];
    return {
      high: Math.max(...temps), low: Math.min(...temps),
      wind: Math.max(...winds), gust: Math.max(...hrs.map((r) => r.gust)),
      precip: hrs.reduce((a, r) => a + r.precip, 0), pop: Math.max(...hrs.map((r) => r.pop)),
      snow: hrs.reduce((a, r) => a + r.snowfall, 0), flNoon: noon.fl,
      code: noon.code,
    };
  }

  function buildVerdict(s, project) {
    const { day, nwac, mountain } = s;
    const range = fmtRange(project.targetStart, project.targetEnd);
    if (s.tone === "good")
      return <>A textbook high-pressure window over <strong>{mountain.name}</strong>. Light winds, dry skies, and a settled snowpack line up across {range}. Cold but stable — <strong>conditions favor a go</strong>.</>;
    if (s.tone === "alert")
      return <>Active weather dominates the window. New snow and rising winds are building reactive slabs, with danger climbing to <strong>{DANGER[nwac.tomorrow.high].label}</strong> by Sunday. This is a <strong>stand-down pattern</strong> — reassess once the system clears.</>;
    return <>A cold, mostly clear window holds before a front edges in late in the period. Summit highs near <strong>{day.high}°</strong> with winds gusting to <strong>{day.maxGust} mph</strong> are the limiting factor — an <strong>early, fast push is favored</strong> over the target weekend.</>;
  }

  function Detail({ project, go }) {
    const [band, setBand] = React.useState("summit");
    const [copied, setCopied] = React.useState(false);
    const mountain = window.MWX.getMountain(project.mountainId);
    const det = window.MWX.getDetail(project.mountainId);
    const s = window.MWX.summarize(project);
    const tModel = chooseTargetModel(det);
    const tRows = targetRows(det, tModel);
    const modelLabel = tModel === "hrrr" ? "HRRR · 3 km" : "GFS · 25 km";

    const copy = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };

    return (
      <div>
        <div className="detail-head">
          <div className="detail-head-in">
            <div className="dh-left">
              <button className="dh-back" onClick={() => go("dashboard")} aria-label="Back"><Icons.arrowLeft size={18} /></button>
              <div style={{ minWidth: 0 }}>
                <div className="dh-title">{project.name}</div>
                <div className="dh-meta">
                  <span><Icons.mountain size={13} style={{ verticalAlign: -2 }} /> {mountain.name}</span>
                  <span><Icons.calendar size={13} style={{ verticalAlign: -2 }} /> {fmtRange(project.targetStart, project.targetEnd)}</span>
                  <span className="mono-dim"><Icons.refresh size={12} style={{ verticalAlign: -2 }} /> {fmtRefreshed(project.lastRefreshed)}</span>
                </div>
              </div>
            </div>
            <div className="dh-actions">
              <button className="btn btn-ghost btn-sm" onClick={copy}>
                {copied ? <><Icons.check size={15} /> Copied</> : <><Icons.link size={15} /> Share</>}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => go("lab", { id: project.id })}>
                <Icons.sliders size={15} /> Model lab
              </button>
            </div>
          </div>
        </div>

        <div className="detail-body">
          {/* verdict */}
          <div className="panel" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 28, alignItems: "center" }}>
            <div>
              <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={"tone-dot tone-" + s.tone} /> The call for {fmtDate(project.targetStart, { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <p style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.45, margin: "10px 0 0", letterSpacing: "-0.01em", textWrap: "pretty" }}>
                {buildVerdict(s, project)}
              </p>
            </div>
            <div style={{ display: "flex", gap: 26, paddingLeft: 28, borderLeft: "1px solid var(--line)" }}>
              <Stat label="Summit" value={`${s.day.high}°`} sub={`low ${s.day.low}°`} />
              <Stat label="Wind" value={s.day.maxWind} unit="mph" sub={`gust ${s.day.maxGust}`} />
              <Stat label="Freezing" value={fmt(s.freezeNoon)} unit="ft" sub="at noon" />
            </div>
          </div>

          {/* daily outlook — the lead glance */}
          <DailyOutlook mountain={mountain} det={det} project={project} band={band} setBand={setBand} go={go} />

          {/* hero */}
          <div>
            <PanelHead kicker="Signature view" title="Freezing level cross-section"
              right={<span className="mono-dim">{modelLabel} · {fmtDate(window.MWX.TARGET, { weekday: "short", month: "short", day: "numeric" })}</span>} />
            <FreezingLevelHero mountain={mountain} dayRows={tRows} modelLabel={modelLabel} />
          </div>

          {/* confidence strip */}
          <ConfidenceStrip det={det} project={project} go={go} />

          {/* avalanche + snowpack */}
          <div className="detail-grid cols-3">
            <AvalanchePanel nwac={det.nwac} />
            <SnowpackPanel sno={det.snotel} />
          </div>

          {/* satellite + notes */}
          <div className="detail-grid cols-2">
            <SatellitePanel sat={det.satellite} mountain={mountain} />
            <div className="panel">
              <div className="kicker">Project notes</div>
              <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, margin: "4px 0 12px" }}>Plan</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>{project.notes}</p>
              <div style={{ display: "flex", gap: 22, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <Stat label="Party" value={project.party} unit="climbers" />
                <Stat label="Zone" value={det.nwac.zone} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Stat({ label, value, unit, sub }) {
    return (
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ fontSize: typeof value === "string" && value.length > 8 ? 16 : undefined }}>{value}{unit && <span className="stat-unit">{unit}</span>}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    );
  }

  function PanelHead({ kicker, title, right }) {
    return (
      <div className="section-head">
        <div><div className="kicker">{kicker}</div><h2 className="section-title">{title}</h2></div>
        {right}
      </div>
    );
  }

  // ---- Daily outlook — lead glance with progressive granularity ----------
  // day → AM/Mid/PM periods → hourly (hourly scoped to the next 48 h)
  function DailyOutlook({ mountain, det, project, band, setBand, go }) {
    const [zoom, setZoom] = React.useState("day"); // day | period | hour
    const gfs = det.forecast.gfs;
    const days = [...new Set(gfs.filter(Boolean).map((r) => r.t.slice(0, 10)))];
    const inTarget = (d) => d >= project.targetStart && d <= project.targetEnd;
    const hrLbl = (h) => (h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : (h - 12) + "p");
    const agg = (rows) => {
      const temps = rows.map((r) => r.bands[band].temp);
      return {
        hi: Math.max(...temps), lo: Math.min(...temps),
        wind: Math.max(...rows.map((r) => r.wind)), gust: Math.max(...rows.map((r) => r.gust)),
        precip: rows.reduce((a, r) => a + r.precip, 0), snow: rows.reduce((a, r) => a + r.snowfall, 0),
        pop: Math.max(...rows.map((r) => r.pop)),
        code: (rows.find((r) => new Date(r.t).getHours() === 12) || rows[Math.floor(rows.length / 2)]).code,
      };
    };

    // build cells + day-group headers per zoom level
    let cells = [], groups = [];
    if (zoom === "day") {
      cells = days.map((d) => {
        const rows = gfs.filter((r) => r && r.t.slice(0, 10) === d);
        return { key: d, label: fmtDate(d, { weekday: "short" }), sub: fmtDate(d, { month: "short", day: "numeric" }), isTarget: inTarget(d), ...agg(rows) };
      });
    } else if (zoom === "period") {
      const P = [["Morning", 6, 12], ["Midday", 12, 18], ["Night", 18, 24]];
      days.forEach((d) => {
        const dayRows = gfs.filter((r) => r && r.t.slice(0, 10) === d);
        let span = 0;
        P.forEach(([lbl, a0, b0]) => {
          const rows = dayRows.filter((r) => { const h = new Date(r.t).getHours(); return h >= a0 && h < b0; });
          if (!rows.length) return;
          cells.push({ key: d + lbl, label: lbl, isTarget: inTarget(d), ...agg(rows) });
          span++;
        });
        if (span) groups.push({ label: fmtDate(d, { weekday: "short", month: "short", day: "numeric" }), span, isTarget: inTarget(d) });
      });
    } else { // hour — next 48 h, HRRR where available, else GFS
      const startIdx = window.MWX.times.findIndex((t) => t >= window.MWX.NOW);
      const endIdx = Math.min(startIdx + 48, window.MWX.HOURS);
      let curDay = null;
      for (let i = startIdx; i < endIdx; i++) {
        const row = det.forecast.hrrr[i] || gfs[i];
        if (!row) continue;
        const d = row.t.slice(0, 10);
        const h = new Date(row.t).getHours();
        cells.push({ key: i, label: hrLbl(h), isTarget: inTarget(d), single: true, src: det.forecast.hrrr[i] ? "HRRR" : "GFS", ...agg([row]) });
        if (d !== curDay) { groups.push({ label: fmtDate(d, { weekday: "short", month: "short", day: "numeric" }), span: 1, isTarget: inTarget(d) }); curDay = d; }
        else groups[groups.length - 1].span++;
      }
    }

    const n = cells.length;
    const allSingle = zoom === "hour";
    const scroll = zoom !== "day";
    const colW = zoom === "period" ? 92 : 48;
    const innerW = scroll ? n * colW : "100%";
    const firstT = cells.findIndex((c) => c.isTarget);
    const lastT = cells.map((c) => c.isTarget).lastIndexOf(true);

    // temperature ribbon (viewBox: 100 units per column)
    const K = 100, H = 72;
    const his = cells.map((c) => c.hi), los = cells.map((c) => c.lo);
    const mn = Math.min(...los) - 3, mx = Math.max(...his) + 3;
    const X = (i) => i * K + K / 2;
    const Y = (v) => H - 9 - ((v - mn) / (mx - mn || 1)) * (H - 20);
    const hiPts = cells.map((c, i) => ({ x: X(i), y: Y(c.hi) }));
    const loPts = cells.map((c, i) => ({ x: X(i), y: Y(c.lo) }));
    const area = `${Charts.linePath(hiPts)} L ${X(n - 1)} ${Y(los[n - 1])} ${cells.slice().reverse().map((c, j) => `L ${X(n - 1 - j)} ${Y(c.lo)}`).join(" ")} Z`;

    const precipFor = (c) => {
      if (c.snow > 0.2) return { t: `${c.snow.toFixed(c.snow >= 10 ? 0 : 1)}"`, c: "var(--accent)", I: Icons.flake };
      if (c.precip > 0.02) return { t: `${c.precip.toFixed(2)}"`, c: "var(--d3)", I: Icons.drop };
      if (c.pop > 40) return { t: "chance", c: "var(--muted)", I: Icons.cloud };
      return { t: "dry", c: "var(--faint)", I: Icons.sun };
    };

    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="kicker">Daily outlook</div>
            <h3>The days around your window</h3>
          </div>
          <Segmented value={band} onChange={setBand}
            options={[{ value: "base", label: "Base" }, { value: "mid", label: "Mid" }, { value: "summit", label: "Summit" }]} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div className="mono-dim">{mountain.bandNames[band]} · {fmt(mountain.elevations[band])} ft{zoom === "hour" ? " · hourly temperature" : " · daytime high / overnight low"}</div>
          <Segmented value={zoom} onChange={setZoom}
            options={[{ value: "day", label: "Daily" }, { value: "period", label: "AM·Mid·PM" }, { value: "hour", label: "Hourly" }]} />
        </div>

        <div className="daily">
          <div className="daily-scroll">
            <div style={{ width: innerW }}>
              {scroll && (
                <div className="daily-groups">
                  {groups.map((g, i) => (
                    <div key={i} className={"daily-group" + (g.isTarget ? " is-target" : "")} style={{ width: g.span * colW }}>{g.label}</div>
                  ))}
                </div>
              )}
              <svg className="daily-trend" viewBox={`0 0 ${n * K} ${H}`} preserveAspectRatio="none" style={{ width: innerW }}>
                {firstT >= 0 && <rect x={firstT * K} y="0" width={(lastT - firstT + 1) * K} height={H} fill="var(--target-band)" />}
                <path d={area} fill="var(--accent)" opacity="0.07" />
                <path d={Charts.linePath(hiPts)} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                {!allSingle && <path d={Charts.linePath(loPts)} fill="none" stroke="var(--muted)" strokeWidth="1.75" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                {hiPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={allSingle ? 1.5 : 2.6} fill="var(--accent)" />)}
              </svg>
              <div className="daily-grid" style={scroll ? { gridTemplateColumns: `repeat(${n}, ${colW}px)` } : undefined}>
                {cells.map((c, i) => {
                  const pc = precipFor(c);
                  const compact = zoom !== "day";
                  return (
                    <div key={c.key} className={"day-tile" + (c.isTarget ? " is-target" : "") + (compact ? " compact" : "")}>
                      {c.isTarget && i === firstT && <span className="dt-flag">Target</span>}
                      <div className="dt-day">{c.label}</div>
                      {c.sub && <div className="dt-date">{c.sub}</div>}
                      <div className="dt-ico"><WeatherIcon code={c.code} size={compact ? 18 : 26} /></div>
                      <div className="dt-temp">{c.hi}°{!c.single && <span className="lo"> / {c.lo}°</span>}</div>
                      <div className="dt-wind"><Icons.wind size={11} /> {c.wind}{!allSingle && <span style={{ color: "var(--faint)" }}> g{c.gust}</span>}</div>
                      {zoom !== "hour" && <div className="dt-precip" style={{ color: pc.c }}><pc.I size={11} style={{ verticalAlign: -1 }} /> {pc.t}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <div className="daily-legend">
            <span><span className="legend-swatch" style={{ background: "var(--accent)" }} /> {allSingle ? "Temp" : "High"}</span>
            {!allSingle && <span><span className="legend-swatch" style={{ background: "var(--muted)" }} /> Low</span>}
            <span><span className="tone-dot" style={{ background: "var(--accent)", opacity: 0.3, borderRadius: 2, width: 16 }} /> Target window</span>
            {zoom === "hour" && <span className="mono-dim" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icons.clock size={12} /> Inside the 48-h window · HRRR 3 km</span>}
          </div>
          <button className="drill-link" onClick={() => go("lab", { id: project.id })}>
            <Icons.grid size={15} /> Open full hourly grid & raw data
          </button>
        </div>
      </div>
    );
  }

  // ---- Forecast confidence strip ------------------------------------------
  function ConfidenceStrip({ det, project, go }) {
    const tDay = window.MWX.TARGET;
    const highs = ["hrrr", "gfs", "ecmwf"].map((m) => det.daily[m][tDay]).filter(Boolean).map((x) => x.high);
    const spread = Math.max(...highs) - Math.min(...highs);
    const conf = spread <= 6 ? "High" : spread <= 14 ? "Moderate" : "Low";
    const cColor = conf === "High" ? "var(--good)" : conf === "Moderate" ? "var(--caution)" : "var(--alert)";
    return (
      <div className="panel conf-strip">
        <div className="conf-lead">
          <div className="kicker">Forecast confidence</div>
          <div className="conf-head"><span className="tone-dot" style={{ background: cColor }} /> {conf} agreement</div>
          <div className="conf-sub">Models sit within {spread}° on the target-day summit high. {conf === "Low" ? "Treat the forecast as a range." : "Solid enough to plan around."}</div>
        </div>
        <div className="conf-models">
          {[["hrrr", "HRRR", "var(--accent)"], ["gfs", "GFS", "var(--caution)"], ["ecmwf", "ECMWF", "var(--good)"]].map(([k, lbl, c]) => {
            const dv = det.daily[k][tDay];
            return (
              <div key={k} className="conf-model">
                <span className="modeltag" style={{ background: "color-mix(in srgb," + c + " 14%, var(--surface))", color: c }}>{lbl}</span>
                <span className="conf-val">{dv ? dv.high + "°" : "n/a"}</span>
              </div>
            );
          })}
        </div>
        <button className="drill-link" onClick={() => go("lab", { id: project.id })}>
          <Icons.sliders size={15} /> Compare all models →
        </button>
      </div>
    );
  }

  function AvalanchePanel({ nwac }) {
    const [open, setOpen] = React.useState(false);
    return (
      <div className="panel">
        <div className="panel-head">
          <div><div className="kicker">NWAC · {nwac.zone}</div><h3>Avalanche danger</h3></div>
          <DangerChip level={nwac.today.high} />
        </div>
        <div className="avy-today">
          <div>
            <div className="mono-dim" style={{ marginBottom: 8 }}>Today</div>
            <DangerColumn danger={nwac.today} />
            <div className="mono-dim" style={{ margin: "16px 0 8px" }}>Tomorrow</div>
            <DangerColumn danger={nwac.tomorrow} compact />
          </div>
          <div style={{ maxWidth: 360 }}>
            <p className="bottomline">{nwac.bottomLine}</p>
          </div>
        </div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {nwac.problems.map((p, i) => (
            <div className="problem" key={i}>
              <div className="problem-rose">
                <AspectRose aspects={p.aspects} size={108} />
                <small>aspect / elevation</small>
              </div>
              <div className="problem-body">
                <h4>{p.type}</h4>
                <div className="problem-tags">
                  <span className="ptag">{p.likelihood}</span>
                  <span className="ptag">Size {p.size}</span>
                </div>
                <p>{p.note}</p>
              </div>
            </div>
          ))}
        </div>
        <button className="drill-link" style={{ marginTop: 16 }} onClick={() => setOpen(!open)}>
          <Icons.chevron size={14} style={{ transform: open ? "rotate(90deg)" : "none" }} /> {open ? "Hide" : "Read"} snowpack analysis
        </button>
        {open && <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 12 }}>{nwac.snowpack}</p>}
      </div>
    );
  }

  function SnowpackPanel({ sno }) {
    const trend = sno.trend.map((t) => ({ v: t.depth }));
    const c = sno.pct >= 90 ? "var(--good)" : sno.pct >= 70 ? "var(--caution)" : "var(--alert)";
    return (
      <div className="panel">
        <div className="panel-head">
          <div><div className="kicker">SNOTEL · {sno.station}</div><h3>Snowpack</h3></div>
        </div>
        <div className="snotel-top">
          <Stat label="Snow depth" value={sno.depth} unit="in" />
          <Stat label="SWE" value={sno.swe} unit="in" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, color: c }}>{sno.pct}%</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>of median SWE for today<br /><span className="mono-dim">{sno.station} · {fmt(sno.elev)} ft</span></span>
        </div>
        <div className="snotel-trend">
          <div className="mono-dim" style={{ marginBottom: 4 }}>Snow depth · last 30 days</div>
          <Charts.AreaSpark data={trend} color="var(--accent)" fill="var(--accent-soft)" h={56} />
        </div>
        <div className="note-card" style={{ marginTop: 14 }}>
          SWE — snow water equivalent — is the water held in the snowpack. It’s the truest measure of how deep and consolidated the base is for travel and stability.
        </div>
      </div>
    );
  }

  function SatellitePanel({ sat, mountain }) {
    const old = sat.ageDays > 14;
    return (
      <div className="panel">
        <div className="panel-head">
          <div><div className="kicker">Copernicus Sentinel-2</div><h3>Snow coverage</h3></div>
          <Icons.satellite size={18} style={{ color: "var(--muted)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 20, alignItems: "center" }}>
          <div className="sat-tile">
            <div className="sat-placeholder"><Icons.satellite size={22} style={{ marginBottom: 6 }} /><br />RGB tile<br />{mountain.name}</div>
          </div>
          <div className="sat-meta">
            <div className="meta-row"><span className="k">Scene date</span><span className="v">{fmtDate(sat.date, { month: "short", day: "numeric", year: "numeric" })}</span></div>
            <div className="meta-row"><span className="k">Cloud cover</span><span className="v">{sat.cloud}%</span></div>
            <div className="meta-row"><span className="k">Age</span><span className="v">{sat.ageDays} days</span></div>
            <div className="note-card" style={{ marginTop: 4 }}>
              {old ? "No recent cloud-free imagery — showing the last clear scene." : "Recent cloud-free scene. Snowline is visible down to valley floor across the massif."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  Object.assign(window, { Detail });
})();
