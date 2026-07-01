/* Shared UI — brand, header, badges, danger scale, stats, segmented control. */
(function () {
  const { Icons } = window;

  const DANGER = {
    1: { label: "Low", v: "var(--d1)" },
    2: { label: "Moderate", v: "var(--d2)" },
    3: { label: "Considerable", v: "var(--d3)" },
    4: { label: "High", v: "var(--d4)" },
    5: { label: "Extreme", v: "var(--d5)" },
  };

  function Brand({ onClick }) {
    return (
      <button className="brand" onClick={onClick} aria-label="Cirque home">
        <span className="brand-mark"><Icons.mountain size={22} sw={1.7} /></span>
        <span className="brand-word">Cirque</span>
      </button>
    );
  }

  function Header({ route, go }) {
    const tab = (name, label) => (
      <button className={"nav-link" + (route.name === name ? " is-active" : "")}
        onClick={() => go(name)}>{label}</button>
    );
    return (
      <header className="appbar">
        <div className="appbar-in">
          <Brand onClick={() => go("dashboard")} />
          <nav className="nav">
            {tab("dashboard", "Projects")}
            {tab("mountains", "Peaks")}
          </nav>
          <button className="btn btn-primary" onClick={() => go("create")}>
            <Icons.pin size={16} /> Pin a Peak
          </button>
        </div>
      </header>
    );
  }

  // condition tone dot
  function ToneDot({ tone }) {
    return <span className={"tone-dot tone-" + tone} aria-hidden="true" />;
  }
  const TONE_LABEL = { good: "Favorable", caution: "Marginal", alert: "Hazardous" };

  function DangerChip({ level, tomorrow }) {
    const d = DANGER[level] || DANGER[1];
    return (
      <span className="danger-chip" style={{ "--c": d.v }}>
        <span className="danger-num">{level}</span>
        <span className="danger-lbl">{d.label}{tomorrow ? " →" : ""}</span>
      </span>
    );
  }

  // three-band danger column (High / Mid / Low)
  function DangerColumn({ danger, compact }) {
    const bands = [["high", "Upper"], ["mid", "Middle"], ["low", "Lower"]];
    return (
      <div className={"danger-col" + (compact ? " compact" : "")}>
        {bands.map(([k, lbl]) => {
          const lvl = danger[k];
          const d = DANGER[lvl];
          return (
            <div className="danger-row" key={k}>
              <span className="danger-band">{lbl}</span>
              <span className="danger-meter">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className="danger-seg"
                    style={{ background: n <= lvl ? DANGER[n].v : "var(--line)" }} />
                ))}
              </span>
              <span className="danger-tag" style={{ color: d.v }}>{lvl} · {d.label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function Stat({ label, value, unit, sub, accent }) {
    return (
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={accent ? { color: accent } : null}>
          {value}<span className="stat-unit">{unit}</span>
        </div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    );
  }

  function PrecipChip({ type }) {
    const map = {
      snow: { icon: Icons.flake, label: "Snow", c: "var(--accent)" },
      rain: { icon: Icons.drop, label: "Rain", c: "var(--d3)" },
      mixed: { icon: Icons.drop, label: "Mixed", c: "var(--d3)" },
      chance: { icon: Icons.cloud, label: "Chance", c: "var(--muted)" },
      none: { icon: Icons.sun, label: "Dry", c: "var(--muted)" },
    };
    const p = map[type] || map.none;
    const I = p.icon;
    return <span className="precip-chip" style={{ color: p.c }}><I size={14} /> {p.label}</span>;
  }

  function Segmented({ options, value, onChange }) {
    return (
      <div className="segmented" role="tablist">
        {options.map((o) => (
          <button key={o.value} role="tab" aria-selected={value === o.value}
            className={"seg" + (value === o.value ? " is-active" : "")}
            onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    );
  }

  function SectionTitle({ kicker, title, action }) {
    return (
      <div className="section-head">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h2 className="section-title">{title}</h2>
        </div>
        {action}
      </div>
    );
  }

  // last-refreshed relative
  function fmtRefreshed(iso) {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  }
  function fmtDate(iso, opts) {
    return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US",
      opts || { weekday: "short", month: "short", day: "numeric" });
  }
  function fmtRange(a, b) {
    const da = new Date(a + "T12:00:00"), db = new Date(b + "T12:00:00");
    const mo = { month: "short" }, d = { day: "numeric" };
    if (a === b) return da.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return `${da.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${db.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  Object.assign(window, {
    UI: {
      Brand, Header, ToneDot, TONE_LABEL, DangerChip, DangerColumn, Stat,
      PrecipChip, Segmented, SectionTitle, DANGER, fmtRefreshed, fmtDate, fmtRange,
    },
  });
})();
