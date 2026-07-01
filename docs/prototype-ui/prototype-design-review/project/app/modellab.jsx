/* Model Lab — the data-heavy, aviation-style drill-down layer. */
(function () {
  const { Icons, UI, Charts } = window;
  const { Segmented, fmtDate } = UI;
  const fmt = (n) => Math.round(n).toLocaleString();
  const MODELS = [
    { key: "hrrr", label: "HRRR", color: "var(--accent)", res: "3 km · 0–48 h" },
    { key: "gfs", label: "GFS", color: "var(--caution)", res: "25 km · 16 d" },
    { key: "ecmwf", label: "ECMWF", color: "var(--good)", res: "9 km · 15 d" },
  ];

  function seriesFor(det, accessor) {
    return MODELS.map((m) => ({
      key: m.key, color: m.color,
      points: det.forecast[m.key].map((r, i) => (r ? { x: i, y: accessor(r) } : null)).filter(Boolean),
    }));
  }

  function ModelLab({ project, go }) {
    const mountain = window.MWX.getMountain(project.mountainId);
    const det = window.MWX.getDetail(project.mountainId);
    const [active, setActive] = React.useState({ hrrr: true, gfs: true, ecmwf: true });
    const [evoVar, setEvoVar] = React.useState("high");
    const [tableModel, setTableModel] = React.useState("gfs");

    const rows0 = det.forecast.gfs;
    const dayStarts = rows0.map((r, i) => (r && new Date(r.t).getHours() === 0 ? { i, t: fmtDate(r.t.slice(0, 10), { weekday: "short" }) } : null)).filter(Boolean);
    const tStartI = 48, tEndI = 96; // Feb14 00:00 → Feb16 00:00
    const band = { x0: tStartI, x1: tEndI };

    const filt = (series) => series.map((s) => active[s.key] ? s : { ...s, faded: true });

    // disagreement at target noon (i=60)
    const noonI = 60;
    const spreadTemp = spread(det, noonI, (r) => r.bands.summit.temp);
    const spreadWind = spread(det, noonI, (r) => r.wind);

    return (
      <div className="lab">
        <div className="lab-head">
          <div className="lab-head-in">
            <button className="dh-back" onClick={() => go("detail", { id: project.id })} aria-label="Back"><Icons.arrowLeft size={18} /></button>
            <div className="lab-title">Model Lab — {mountain.name}</div>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
              {MODELS.map((m) => (
                <button key={m.key} className="modeltag"
                  onClick={() => setActive({ ...active, [m.key]: !active[m.key] })}
                  style={{ background: active[m.key] ? "color-mix(in srgb," + m.color + " 15%, var(--surface))" : "var(--surface-2)", color: active[m.key] ? m.color : "var(--faint)", border: "1px solid " + (active[m.key] ? "color-mix(in srgb," + m.color + " 35%, transparent)" : "var(--line)"), cursor: "pointer", opacity: active[m.key] ? 1 : 0.6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: "inline-block" }} /> {m.label}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{m.res}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lab-body">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", margin: 0, maxWidth: "60ch", lineHeight: 1.6 }}>
              RAW MULTI-MODEL COMPARISON · {mountain.lat.toFixed(4)}, {mountain.lng.toFixed(4)} · TZ AMERICA/LOS_ANGELES · TARGET {window.MWX.TARGET} HIGHLIGHTED. Convergence ⇒ confidence; divergence ⇒ uncertainty.
            </p>
          </div>

          <div className="lab-grid">
            <ChartPanel title="Summit temperature" unit="°F" flag={spreadTemp > 15 ? `Δ${Math.round(spreadTemp)}°F at target` : null}>
              <Charts.LineChart series={filt(seriesFor(det, (r) => r.bands.summit.temp))} xLabels={dayStarts} band={band} yUnit="°F" h={210} />
            </ChartPanel>
            <ChartPanel title="Summit wind" unit="mph" flag={spreadWind > 20 ? `Δ${Math.round(spreadWind)} mph at target` : null}>
              <Charts.LineChart series={filt(seriesFor(det, (r) => r.wind))} xLabels={dayStarts} band={band} yUnit="mph" yMin={0} h={210} />
            </ChartPanel>
            <ChartPanel title="Freezing level" unit="ft">
              <Charts.LineChart series={filt(seriesFor(det, (r) => r.fl))} xLabels={dayStarts} band={band} yUnit="ft" h={210} />
            </ChartPanel>
            <ChartPanel title="Precipitation rate" unit="in/hr">
              <Charts.LineChart series={filt(seriesFor(det, (r) => r.precip))} xLabels={dayStarts} band={band} yUnit="in" yMin={0} h={210} />
            </ChartPanel>
          </div>

          {/* evolution */}
          <div className="lab-panel">
            <h3>
              <span>Forecast evolution — how the target-day call has shifted</span>
              <Segmented value={evoVar} onChange={setEvoVar}
                options={[{ value: "high", label: "Temp" }, { value: "maxWind", label: "Wind" }, { value: "flNoon", label: "Freezing" }, { value: "precip", label: "Precip" }]} />
            </h3>
            <EvolutionChart det={det} variable={evoVar} active={active} />
            <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", margin: "12px 0 0" }}>
              Each point = what a model predicted for {window.MWX.TARGET} on that day. Lines drawing together near now ⇒ the forecast is settling.
            </p>
          </div>

          {/* hourly grid */}
          <div className="lab-panel">
            <h3>
              <span>Hourly grid — {fmtDate(window.MWX.TARGET, { weekday: "long", month: "long", day: "numeric" })}</span>
              <Segmented value={tableModel} onChange={setTableModel}
                options={MODELS.map((m) => ({ value: m.key, label: m.label }))} />
            </h3>
            <HourlyGrid det={det} model={tableModel} mountain={mountain} />
          </div>
        </div>
      </div>
    );
  }

  function spread(det, i, acc) {
    const vals = MODELS.map((m) => { const r = det.forecast[m.key][i]; return r ? acc(r) : null; }).filter((x) => x != null);
    return vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
  }

  function ChartPanel({ title, unit, flag, children }) {
    return (
      <div className="lab-panel">
        <h3><span>{title} <span style={{ color: "var(--faint)" }}>· {unit}</span></span>{flag && <span className="disagree"><Icons.alert size={11} style={{ verticalAlign: -1 }} /> {flag}</span>}</h3>
        {children}
        <div className="chart-legend">
          {MODELS.map((m) => (
            <span className="legend-item" key={m.key}><span className="legend-swatch" style={{ background: m.color }} /> {m.label}</span>
          ))}
        </div>
      </div>
    );
  }

  function EvolutionChart({ det, variable, active }) {
    const snaps = det.snapshots;
    const xLabels = snaps.map((s, i) => ({ i, t: fmtDate(s.takenAt.slice(0, 10), { month: "numeric", day: "numeric" }) }));
    const series = MODELS.map((m) => ({
      key: m.key, color: m.color,
      faded: !active[m.key],
      points: snaps.map((s, i) => {
        const mv = s.models[m.key];
        return mv && mv.available ? { x: i, y: mv[variable] } : null;
      }).filter(Boolean),
    }));
    const unit = { high: "°F", maxWind: "mph", flNoon: "ft", precip: "in" }[variable];
    return <Charts.LineChart series={series} xLabels={xLabels} yUnit={unit} h={230} yMin={variable === "precip" ? 0 : undefined} />;
  }

  function HourlyGrid({ det, model, mountain }) {
    const rows = det.forecast[model].filter((r) => r && r.t.slice(0, 10) === window.MWX.TARGET);
    if (!rows.length) return <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>HRRR does not extend to the target date (0–48 h only). Switch to GFS or ECMWF.</p>;
    const hours = rows.map((r) => new Date(r.t).getHours());
    const tcell = (t) => <td className={t <= 15 ? "cell-cold" : t >= 40 ? "cell-hot" : ""}>{Math.round(t)}</td>;
    const Row = ({ label, render }) => (
      <tr><td className="rowlbl">{label}</td>{rows.map((r, i) => render(r, i))}</tr>
    );
    return (
      <div className="grid-scroll">
        <table className="grid-table">
          <thead>
            <tr><th className="rowlbl">Hour</th>{hours.map((h, i) => <th key={i}>{h.toString().padStart(2, "0")}</th>)}</tr>
          </thead>
          <tbody>
            <Row label={`Temp · ${mountain.bandNames.summit}`} render={(r, i) => <React.Fragment key={i}>{tcell(r.bands.summit.temp)}</React.Fragment>} />
            <Row label={`Temp · ${mountain.bandNames.mid}`} render={(r, i) => <React.Fragment key={i}>{tcell(r.bands.mid.temp)}</React.Fragment>} />
            <Row label={`Temp · ${mountain.bandNames.base}`} render={(r, i) => <React.Fragment key={i}>{tcell(r.bands.base.temp)}</React.Fragment>} />
            <Row label="Feels (summit)" render={(r, i) => <td key={i} style={{ color: "var(--faint)" }}>{Math.round(r.bands.summit.feels)}</td>} />
            <Row label="Wind mph" render={(r, i) => <td key={i} className={r.wind >= 45 ? "cell-hot" : ""}>{Math.round(r.wind)}</td>} />
            <Row label="Gust mph" render={(r, i) => <td key={i} className={r.gust >= 60 ? "cell-hot" : ""}>{Math.round(r.gust)}</td>} />
            <Row label="Freezing ft" render={(r, i) => <td key={i}>{fmt(r.fl)}</td>} />
            <Row label="Precip in" render={(r, i) => <td key={i} style={{ color: r.precip > 0 ? "var(--accent)" : "var(--faint)" }}>{r.precip.toFixed(2)}</td>} />
            <Row label="POP %" render={(r, i) => <td key={i}>{r.pop}</td>} />
            <Row label="Snow in" render={(r, i) => <td key={i} style={{ color: r.snowfall > 0 ? "var(--accent)" : "var(--faint)" }}>{r.snowfall.toFixed(1)}</td>} />
          </tbody>
        </table>
      </div>
    );
  }

  Object.assign(window, { ModelLab });
})();
