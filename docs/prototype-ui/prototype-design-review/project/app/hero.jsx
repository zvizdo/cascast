/* Hero — Freezing Level cross-section + avalanche aspect rose. */
(function () {
  const { Icons } = window;
  const fmt = (n) => Math.round(n).toLocaleString();

  // ---- Freezing Level cross-section ---------------------------------------
  // props: mountain, dayRows (hourly rows for target date, chosen model), modelLabel
  function FreezingLevelHero({ mountain, dayRows, modelLabel }) {
    const W = 860, H = 440;
    const valley = 2200;
    const top = mountain.elevations.summit + 1800;
    const Y = (e) => H - 40 - ((e - valley) / (top - valley)) * (H - 80);

    const noon = dayRows.find((r) => new Date(r.t).getHours() === 12) || dayRows[Math.floor(dayRows.length / 2)];
    const fls = dayRows.map((r) => r.fl);
    const flNoon = noon.fl, flMin = Math.min(...fls), flMax = Math.max(...fls);

    // stylized ridge profile (peaks at summit)
    const sx = (f) => f * W;
    const ridge = [
      [0, valley], [0.10, 3200], [0.22, 4600], [0.33, 6400],
      [0.46, 8800], [0.57, 11800], [0.64, mountain.elevations.summit],
      [0.72, 12200], [0.82, 9000], [0.92, 6400], [1, 4800],
    ];
    let ridgePath = `M ${sx(ridge[0][0])} ${Y(ridge[0][1])}`;
    for (let i = 1; i < ridge.length; i++) {
      const p0 = ridge[i - 1], p1 = ridge[i];
      const cx = (sx(p0[0]) + sx(p1[0])) / 2;
      ridgePath += ` C ${cx} ${Y(p0[1])}, ${cx} ${Y(p1[1])}, ${sx(p1[0])} ${Y(p1[1])}`;
    }
    const fillPath = `${ridgePath} L ${W} ${H} L 0 ${H} Z`;

    const bands = [
      { key: "summit", e: mountain.elevations.summit, name: mountain.bandNames.summit, lx: 0.64 },
      { key: "mid", e: mountain.elevations.mid, name: mountain.bandNames.mid, lx: 0.50 },
      { key: "base", e: mountain.elevations.base, name: mountain.bandNames.base, lx: 0.30 },
    ];
    const precipFor = (e) => {
      if (Math.abs(e - flNoon) < 600) return "mixed";
      return e > flNoon ? "snow" : "rain";
    };

    return (
      <div className="hero">
        <div className="hero-figure">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
            <defs>
              <linearGradient id="snowG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--snow-hi)" />
                <stop offset="1" stopColor="var(--snow-lo)" />
              </linearGradient>
              <linearGradient id="rockG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--rock-hi)" />
                <stop offset="1" stopColor="var(--rock-lo)" />
              </linearGradient>
              <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--sky-hi)" />
                <stop offset="1" stopColor="var(--sky-lo)" />
              </linearGradient>
              <clipPath id="mtnClip"><path d={fillPath} /></clipPath>
            </defs>

            {/* sky / atmosphere split at freezing level */}
            <rect x="0" y="0" width={W} height={Y(flNoon)} fill="url(#skyG)" opacity="0.7" />
            <rect x="0" y={Y(flNoon)} width={W} height={H - Y(flNoon)} fill="var(--below-fl)" opacity="0.5" />

            {/* mountain: snow above FL, rock below FL */}
            <g clipPath="url(#mtnClip)">
              <rect x="0" y="0" width={W} height={Y(flNoon)} fill="url(#snowG)" />
              <rect x="0" y={Y(flNoon)} width={W} height={H - Y(flNoon)} fill="url(#rockG)" />
              {/* subtle ridgelines texture */}
              <path d="M 200 440 L 360 120 M 300 440 L 430 150 M 470 440 L 520 130"
                stroke="var(--rock-line)" strokeWidth="1.5" opacity="0.4" fill="none" />
            </g>
            <path d={ridgePath} fill="none" stroke="var(--ridge-stroke)" strokeWidth="1.75" />

            {/* freezing-level day range band + line */}
            <rect x="0" y={Y(flMax)} width={W} height={Math.max(2, Y(flMin) - Y(flMax))}
              fill="var(--accent)" opacity="0.10" />
            <line x1="0" x2={W} y1={Y(flNoon)} y2={Y(flNoon)} stroke="var(--accent)"
              strokeWidth="2" strokeDasharray="2 5" />
            <g transform={`translate(14 ${Y(flNoon) - 10})`}>
              <rect x="0" y="-15" width="186" height="22" rx="4" fill="var(--accent)" />
              <text x="10" y="0" fontFamily="var(--mono)" fontSize="12" fontWeight="600" fill="#fff">
                FREEZING LEVEL · {fmt(flNoon)} ft
              </text>
            </g>

            {/* elevation axis ticks */}
            {[4000, 8000, 12000].map((e) => (
              <g key={e}>
                <text x={W - 8} y={Y(e) + 4} textAnchor="end" fontFamily="var(--mono)"
                  fontSize="10" fill="var(--muted)" opacity="0.8">{fmt(e)}'</text>
              </g>
            ))}

            {/* band guides + dots */}
            {bands.map((b) => (
              <g key={b.key}>
                <line x1={sx(b.lx)} x2={W - 150} y1={Y(b.e)} y2={Y(b.e)}
                  stroke="var(--ink)" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="1 4" />
                <circle cx={sx(b.lx)} cy={Y(b.e)} r="4" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />
              </g>
            ))}
          </svg>

          {/* floating band labels (HTML over SVG, positioned by elevation %) */}
          {bands.map((b) => {
            const noonBand = noon.bands[b.key];
            const pt = precipFor(b.e);
            const topPct = (Y(b.e) / H) * 100;
            return (
              <div className="band-card" key={b.key} style={{ top: `calc(${topPct}% - 26px)` }}>
                <div className="band-card-name">{b.name}</div>
                <div className="band-card-row">
                  <span className="band-elev">{fmt(b.e)} ft</span>
                  <span className="band-temp">{noonBand.temp}°<span className="band-feels">feels {noonBand.feels}°</span></span>
                </div>
                <div className={"band-precip pt-" + pt}>
                  {pt === "snow" ? <Icons.flake size={12} /> : pt === "mixed" ? <Icons.cloud size={12} /> : <Icons.drop size={12} />}
                  {pt === "snow" ? "All snow" : pt === "mixed" ? "Mixed / near freezing" : "Rain / melt"}
                </div>
              </div>
            );
          })}
        </div>

        {/* day strip + readout */}
        <div className="hero-side">
          <div className="hero-readout">
            <div className="kicker">Target · noon</div>
            <div className="hero-fl">{fmt(flNoon)}<span>ft</span></div>
            <div className="hero-fl-sub">Freezing level — {modelLabel}</div>
          </div>
          <div className="hero-daystrip">
            <div className="daystrip-label">
              <span>Freezing level through the day</span>
              <span className="mono-dim">{fmt(flMin)}–{fmt(flMax)} ft</span>
            </div>
            <DayStrip rows={dayRows} valley={valley} top={top} summit={mountain.elevations.summit} bands={mountain.elevations} />
          </div>
          <div className="hero-note">
            <Icons.eye size={14} />
            <span>Line sits <strong>{flNoon < mountain.elevations.base ? "below the trailhead" : flNoon > mountain.elevations.summit ? "above the summit" : `${fmt(mountain.elevations.summit - flNoon)} ft below the summit`}</strong> — precip falls as snow above it.</span>
          </div>
        </div>
      </div>
    );
  }

  // small freezing-level-through-day line with band reference lines
  function DayStrip({ rows, valley, top, summit, bands }) {
    const W = 300, H = 116;
    const Y = (e) => H - 8 - ((e - valley) / (top - valley)) * (H - 16);
    const X = (i) => 4 + (i / (rows.length - 1)) * (W - 8);
    let p = `M ${X(0)} ${Y(rows[0].fl)}`;
    rows.forEach((r, i) => { if (i) p += ` L ${X(i)} ${Y(r.fl)}`; });
    const area = `${p} L ${X(rows.length - 1)} ${H} L ${X(0)} ${H} Z`;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {[["summit", summit], ["mid", bands.mid], ["base", bands.base]].map(([k, e]) => (
          <line key={k} x1="0" x2={W} y1={Y(e)} y2={Y(e)} stroke="var(--line)" strokeWidth="1" />
        ))}
        <path d={area} fill="var(--accent)" opacity="0.10" />
        <path d={p} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {[0, 6, 12, 18].map((h) => {
          const i = rows.findIndex((r) => new Date(r.t).getHours() === h);
          return i >= 0 ? <text key={h} x={X(i)} y={H - 1} textAnchor="middle" fontSize="8.5"
            fontFamily="var(--mono)" fill="var(--muted)">{h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? (h - 12) + "p" : h + "a"}</text> : null;
        })}
      </svg>
    );
  }

  // ---- Aspect/elevation rose ----------------------------------------------
  // aspects: { low:{N..}, mid:{...}, high:{...} } booleans
  function AspectRose({ aspects, size = 132, color = "var(--accent)" }) {
    const cx = size / 2, cy = size / 2;
    const rings = { low: [0.18, 0.42], mid: [0.42, 0.66], high: [0.66, 0.92] };
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const R = size / 2;
    const sector = (r0, r1, idx) => {
      const a0 = (idx * 45 - 90 - 22.5) * Math.PI / 180;
      const a1 = ((idx + 1) * 45 - 90 - 22.5) * Math.PI / 180;
      const p = (a, r) => [cx + Math.cos(a) * r * R, cy + Math.sin(a) * r * R];
      const [x0, y0] = p(a0, r0), [x1, y1] = p(a1, r0);
      const [x2, y2] = p(a1, r1), [x3, y3] = p(a0, r1);
      return `M ${x0} ${y0} A ${r0 * R} ${r0 * R} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r1 * R} ${r1 * R} 0 0 0 ${x3} ${y3} Z`;
    };
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {Object.entries(rings).map(([band, [r0, r1]]) =>
          dirs.map((d, i) => (
            <path key={band + d} d={sector(r0, r1, i)}
              fill={aspects[band][d] ? color : "var(--line)"}
              fillOpacity={aspects[band][d] ? (band === "high" ? 0.95 : band === "mid" ? 0.7 : 0.45) : 0.5}
              stroke="var(--surface)" strokeWidth="1.4" />
          ))
        )}
        {dirs.map((d, i) => {
          const a = (i * 45 - 90) * Math.PI / 180;
          const r = R * 1.0;
          return <text key={d} x={cx + Math.cos(a) * r} y={cy + Math.sin(a) * r + 3}
            textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="var(--muted)">{d}</text>;
        })}
      </svg>
    );
  }

  Object.assign(window, { FreezingLevelHero, AspectRose });
})();
