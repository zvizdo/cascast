/* Charts — hand-built SVG primitives. Theme via CSS vars passed as color props. */
(function () {
  const sx = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  const niceMin = (v) => Math.floor(v / 5) * 5;
  const niceMax = (v) => Math.ceil(v / 5) * 5;

  // smooth path through points [{x,y}]
  function linePath(pts) {
    if (!pts.length) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  }

  // --- Area sparkline (snotel trend) ---------------------------------------
  function AreaSpark({ data, w = 280, h = 64, color = "#3E7CA8", fill = "rgba(62,124,168,.14)", pad = 4 }) {
    const ys = data.map((d) => d.v);
    const min = Math.min(...ys), max = Math.max(...ys);
    const X = sx(0, data.length - 1, pad, w - pad);
    const Y = sx(min - (max - min) * 0.1, max + (max - min) * 0.1, h - pad, pad);
    const pts = data.map((d, i) => ({ x: X(i), y: Y(d.v) }));
    const line = linePath(pts);
    const area = `${line} L ${pts[pts.length - 1].x} ${h - pad} L ${pts[0].x} ${h - pad} Z`;
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.6" fill={color} />
      </svg>
    );
  }

  // --- Multi-line chart with axes (model compare / evolution) --------------
  // series: [{ key, color, points:[{x,y}], dashed }], x is numeric index 0..n
  function LineChart({
    series, w = 640, h = 240, xLabels = [], yUnit = "", yMin, yMax,
    pad = { t: 14, r: 14, b: 26, l: 40 }, grid = "var(--line)", ink = "var(--muted)",
    band = null, // {x0,x1} highlight region in index space
    yTicks = 4, font = 11,
  }) {
    const allY = series.flatMap((s) => s.points.map((p) => p.y));
    const mn = yMin != null ? yMin : niceMin(Math.min(...allY));
    const mx = yMax != null ? yMax : niceMax(Math.max(...allY));
    const n = Math.max(...series.map((s) => s.points.length)) - 1;
    const X = sx(0, n, pad.l, w - pad.r);
    const Y = sx(mn, mx, h - pad.b, pad.t);
    const ticks = Array.from({ length: yTicks + 1 }, (_, i) => mn + (i * (mx - mn)) / yTicks);
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
        {band && (
          <rect x={X(band.x0)} y={pad.t} width={X(band.x1) - X(band.x0)} height={h - pad.b - pad.t}
            fill="var(--target-band)" />
        )}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke={grid} strokeWidth="1" />
            <text x={pad.l - 8} y={Y(t) + font / 3} textAnchor="end" fontSize={font}
              fill={ink} fontFamily="var(--mono)">{Math.round(t)}</text>
          </g>
        ))}
        {xLabels.map((lb, i) => lb && (
          <text key={i} x={X(lb.i)} y={h - pad.b + 16} textAnchor="middle" fontSize={font}
            fill={ink} fontFamily="var(--mono)">{lb.t}</text>
        ))}
        {series.map((s) => (
          <path key={s.key} d={linePath(s.points.map((p) => ({ x: X(p.x), y: Y(p.y) })))}
            fill="none" stroke={s.color} strokeWidth={s.width || 2}
            strokeDasharray={s.dashed ? "4 4" : null}
            opacity={s.faded ? 0.35 : 1} vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return last ? <circle key={s.key + "d"} cx={X(last.x)} cy={Y(last.y)} r="3" fill={s.color} opacity={s.faded ? 0.4 : 1} /> : null;
        })}
      </svg>
    );
  }

  // --- Bar series (precip) --------------------------------------------------
  function BarChart({ data, w = 640, h = 120, color = "var(--accent)", pad = { t: 10, r: 14, b: 22, l: 40 }, unit = "", xLabels = [], band = null }) {
    const mx = Math.max(0.05, ...data.map((d) => d.v)) * 1.15;
    const X = sx(0, data.length, pad.l, w - pad.r);
    const Y = sx(0, mx, h - pad.b, pad.t);
    const bw = ((w - pad.r - pad.l) / data.length) * 0.6;
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
        {band && <rect x={X(band.x0)} y={pad.t} width={X(band.x1) - X(band.x0)} height={h - pad.b - pad.t} fill="var(--target-band)" />}
        <line x1={pad.l} x2={w - pad.r} y1={Y(0)} y2={Y(0)} stroke="var(--line)" />
        {data.map((d, i) => d.v > 0 && (
          <rect key={i} x={X(i + 0.5) - bw / 2} y={Y(d.v)} width={bw} height={Y(0) - Y(d.v)}
            rx="1.5" fill={d.color || color} opacity={d.faded ? 0.4 : 0.9} />
        ))}
        {xLabels.map((lb, i) => lb && (
          <text key={i} x={X(lb.i + 0.5)} y={h - pad.b + 15} textAnchor="middle" fontSize="11"
            fill="var(--muted)" fontFamily="var(--mono)">{lb.t}</text>
        ))}
        {unit && <text x={pad.l - 8} y={pad.t + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{unit}</text>}
      </svg>
    );
  }

  Object.assign(window, { Charts: { AreaSpark, LineChart, BarChart, linePath, sx } });
})();
