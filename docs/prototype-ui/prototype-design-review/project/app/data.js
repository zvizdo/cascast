/* Mountain Weather — mock data engine.
   Winter scenario, anchored Thu Feb 12 2026 14:00 PST.
   Target weekend: Sat Feb 14 – Sun Feb 15. A cold-clear "go" window
   on Saturday, an incoming front (storm) Sunday. Deterministic. */
(function () {
  "use strict";

  // ---- deterministic RNG ----------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---- time axis ------------------------------------------------------------
  // Forecast window: Feb 12 00:00 → Feb 18 23:00 PST (7 days, hourly).
  const START = new Date("2026-02-12T00:00:00");
  const HOURS = 24 * 7;
  const NOW = new Date("2026-02-12T14:00:00");
  const times = [];
  for (let h = 0; h < HOURS; h++) {
    times.push(new Date(START.getTime() + h * 3600 * 1000));
  }
  const dayKey = (d) => localStamp(d).slice(0, 10);
  function localStamp(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
  }
  const TARGET = "2026-02-14"; // Saturday
  const TARGET_END = "2026-02-15";

  // index helpers
  const hourOf = (d) => d.getHours();
  const fracDay = (d) => (d.getHours() + d.getMinutes() / 60) / 24;

  // ---- per-mountain regimes -------------------------------------------------
  // Each regime returns synoptic drivers across the window (0..1 progress).
  const MOUNTAINS = [
    {
      id: "mt-rainier", name: "Mount Rainier", slug: "mt-rainier",
      lat: 46.8523, lng: -121.7603,
      elevations: { base: 5400, mid: 10000, summit: 14411 },
      bandNames: { base: "Paradise", mid: "Camp Muir", summit: "Columbia Crest" },
      nwacZone: "West Slopes South", snotelStation: "Paradise", snotelId: "679",
      snotelElev: 5430, region: "Cascades — South",
      blurb: "The Mountain. 14,411 ft of heavily glaciated volcano; the standard for Cascade alpinism.",
      regime: "cold-window",
    },
    {
      id: "mt-baker", name: "Mount Baker", slug: "mt-baker",
      lat: 48.7768, lng: -121.8144,
      elevations: { base: 3500, mid: 6000, summit: 10781 },
      bandNames: { base: "Heliotrope TH", mid: "Hogsback", summit: "Grant Peak" },
      nwacZone: "West Slopes North", snotelStation: "Wells Creek", snotelId: "909",
      snotelElev: 4250, region: "Cascades — North",
      blurb: "Glacier-draped and storm-battered. The snowiest place on earth by season record.",
      regime: "stable-high",
    },
    {
      id: "mt-shuksan", name: "Mount Shuksan", slug: "mt-shuksan",
      lat: 48.8312, lng: -121.6019,
      elevations: { base: 3300, mid: 6500, summit: 9131 },
      bandNames: { base: "Lake Ann TH", mid: "Fisher Chimneys", summit: "Summit Pyramid" },
      nwacZone: "West Slopes North", snotelStation: "Wells Creek", snotelId: "909",
      snotelElev: 4250, region: "Cascades — North",
      blurb: "Technical, photogenic, complex. Fisher Chimneys is a committing winter line.",
      regime: "incoming-storm",
    },
  ];

  // synoptic series builder for a regime — returns arrays over HOURS
  function buildSynoptic(regime, rng) {
    const fl = [], wind = [], precip = [], cloud = [], pop = [];
    for (let h = 0; h < HOURS; h++) {
      const t = times[h];
      const p = h / HOURS;                 // 0..1 window progress
      const diur = Math.sin((fracDay(t) - 0.30) * 2 * Math.PI); // -1..1 peaks ~mid-afternoon
      const jit = (rng() - 0.5);
      let freeze, w, pr, cl, pp;

      if (regime === "cold-window") {
        // deep cold clear Thu–Sat; warm front arrives Sun pm raising FL + precip
        const frontArr = clamp((p - 0.62) / 0.18, 0, 1); // ramps Sun→Mon
        freeze = 5200 + diur * 750 + frontArr * 4200 + jit * 250;
        w = 16 + diur * 4 + frontArr * 34 + jit * 6 + Math.max(0, p - 0.3) * 10;
        cl = clamp(0.12 + frontArr * 0.8 + jit * 0.1, 0, 1);
        pp = clamp(frontArr * 0.85 + jit * 0.08, 0, 1);
        pr = frontArr > 0.15 ? frontArr * 0.16 * (0.5 + rng()) : 0;
      } else if (regime === "stable-high") {
        // textbook high pressure all week, light winds, dry, gentle warming
        freeze = 4200 + diur * 800 + p * 900 + jit * 200;
        w = 9 + diur * 3 + jit * 4;
        cl = clamp(0.08 + jit * 0.08, 0, 1);
        pp = clamp(0.04 + jit * 0.05, 0, 1);
        pr = 0;
      } else { // incoming-storm
        // active pattern: front Fri, partial clearing, second system Sun
        const s1 = Math.exp(-(((p - 0.42) / 0.10) ** 2));
        const s2 = Math.exp(-(((p - 0.74) / 0.09) ** 2));
        const storm = clamp(s1 + s2 * 0.9, 0, 1);
        freeze = 3800 + diur * 600 + storm * 3200 + jit * 300;
        w = 22 + diur * 4 + storm * 30 + jit * 8;
        cl = clamp(0.4 + storm * 0.6 + jit * 0.12, 0, 1);
        pp = clamp(0.25 + storm * 0.7 + jit * 0.1, 0, 1);
        pr = storm * 0.22 * (0.6 + rng());
      }
      fl.push(clamp(freeze, 600, 12000));
      wind.push(clamp(w, 2, 95));
      precip.push(Math.max(0, round(pr, 3)));
      cloud.push(cl);
      pop.push(pp);
    }
    return { fl, wind, precip, cloud, pop };
  }

  // temperature at an elevation given freezing level (lapse ~3.5°F/1000ft)
  function tempAt(elevFt, freezeFt, diur, jit) {
    // temp = 32°F at freezing level, lapse away from it
    const lapse = 3.5 / 1000;
    let t = 32 - (elevFt - freezeFt) * lapse;
    t += diur * 6 + jit * 1.5;
    return t;
  }

  function weatherCode(cloud, precip, snow) {
    if (precip > 0.01) return snow ? (precip > 0.08 ? 75 : 71) : (precip > 0.08 ? 65 : 61);
    if (cloud > 0.8) return 3;
    if (cloud > 0.5) return 2;
    if (cloud > 0.2) return 1;
    return 0;
  }

  // build full per-model hourly forecast for a mountain
  function buildForecast(m) {
    const seed = m.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = buildSynoptic(m.regime, mulberry32(seed));
    const models = {};
    const defs = {
      // bias/spread per model. ecmwf slightly warmer & faster front; gfs cooler/slower
      hrrr: { tBias: 0, flBias: 0, wBias: 0, limitH: 48, n: 0.6 },
      gfs:  { tBias: -1.2, flBias: -350, wBias: 2, limitH: HOURS, n: 1.0 },
      ecmwf:{ tBias: 1.4, flBias: 500, wBias: -1.5, limitH: HOURS, n: 1.0 },
    };
    for (const key of Object.keys(defs)) {
      const d = defs[key];
      const rng = mulberry32(seed + key.length * 1000 + 7);
      const rows = [];
      for (let h = 0; h < HOURS; h++) {
        if (h >= d.limitH) { rows.push(null); continue; }
        const t = times[h];
        const diur = Math.sin((fracDay(t) - 0.30) * 2 * Math.PI);
        const jit = (rng() - 0.5) * d.n;
        const fl = clamp(base.fl[h] + d.flBias + jit * 400, 500, 13000);
        const wind = clamp(base.wind[h] + d.wBias + jit * 5, 1, 110);
        const gust = round(wind * (1.4 + rng() * 0.4));
        const precip = base.precip[h] > 0 ? round(base.precip[h] * (0.8 + jit * 0.3), 3) : 0;
        const pop = round(clamp(base.pop[h] * 100 + jit * 8, 0, 100));
        const cloud = clamp(base.cloud[h] + jit * 0.06, 0, 1);
        const bands = {};
        for (const b of ["base", "mid", "summit"]) {
          const tt = tempAt(m.elevations[b], fl, diur, jit) + d.tBias;
          const wchill = tt - clamp(wind * 0.7, 0, 40) * (tt < 50 ? 1 : 0) * 0.5;
          bands[b] = { temp: round(tt), feels: round(wchill) };
        }
        const isSnow = m.elevations.mid > fl; // snow if mid-band above freezing line
        const snowfall = precip > 0 && isSnow ? round(precip * 12, 1) : 0; // ~12:1
        rows.push({
          t: localStamp(t), fl: round(fl), wind: round(wind), gust,
          precip, pop, cloud: round(cloud, 2), snowfall,
          code: weatherCode(cloud, precip, isSnow), bands,
        });
      }
      models[key] = rows;
    }
    return models;
  }

  // daily summary from a model's rows for a given dayKey
  function daySummary(rows, dk) {
    const hrs = rows.filter((r) => r && r.t.slice(0, 10) === dk);
    if (!hrs.length) return null;
    const summit = hrs.map((r) => r.bands.summit.temp);
    const winds = hrs.map((r) => r.wind);
    const gusts = hrs.map((r) => r.gust);
    const noon = hrs.find((r) => new Date(r.t).getHours() === 12) || hrs[0];
    return {
      high: Math.max(...summit), low: Math.min(...summit),
      maxWind: Math.max(...winds), maxGust: Math.max(...gusts),
      precip: round(hrs.reduce((a, r) => a + r.precip, 0), 2),
      snowfall: round(hrs.reduce((a, r) => a + r.snowfall, 0), 1),
      flNoon: noon.fl, code: noon.code,
      pop: Math.max(...hrs.map((r) => r.pop)),
    };
  }

  // ---- NWAC avalanche (winter active) --------------------------------------
  function buildNwac(m) {
    const byMountain = {
      "mt-rainier": {
        zone: "West Slopes South",
        today: { high: 3, mid: 3, low: 2 }, tomorrow: { high: 4, mid: 3, low: 2 },
        bottomLine:
          "Strong SW winds ahead of an incoming front are building fresh wind slabs on N–E aspects near and above treeline. Human-triggered slab avalanches are likely on steep, recently loaded lee features. Choose conservative, lower-angle terrain and avoid being beneath wind-loaded start zones.",
        problems: [
          { type: "Wind Slab", likelihood: "Likely", size: "D1.5–D2",
            aspects: pickAspects(["N", "NE", "E", "SE"], ["mid", "high"]),
            note: "1–2 ft slabs on lee, cross-loaded features near and above treeline." },
          { type: "Persistent Slab", likelihood: "Possible", size: "D2–D2.5",
            aspects: pickAspects(["N", "NE", "E"], ["mid", "high"]),
            note: "A mid-pack crust/facet interface remains reactive in isolated upper-elevation pockets." },
        ],
        snowpack:
          "A late-January crust is buried 50–80 cm deep and capped by recent storm snow. Faceting near the crust has produced isolated propagation in stability tests on shaded upper-elevation slopes.",
      },
      "mt-baker": {
        zone: "West Slopes North",
        today: { high: 2, mid: 2, low: 1 }, tomorrow: { high: 2, mid: 2, low: 1 },
        bottomLine:
          "A stable high-pressure pattern has allowed the snowpack to settle and strengthen. Watch for small loose-dry sluffs off steep, sun-exposed rock on warm afternoons. Generally favorable travel conditions.",
        problems: [
          { type: "Loose Dry", likelihood: "Unlikely", size: "D1",
            aspects: pickAspects(["S", "SE", "SW"], ["high"]),
            note: "Small sluffs off steep solar rock features during peak heating." },
        ],
        snowpack:
          "A well-settled, supportable snowpack under clear skies. No significant persistent weak layers of concern in the current zone.",
      },
      "mt-shuksan": {
        zone: "West Slopes North",
        today: { high: 3, mid: 3, low: 2 }, tomorrow: { high: 4, mid: 4, low: 3 },
        bottomLine:
          "Active weather is delivering new snow and wind. Storm slabs and wind slabs will build through the period and become increasingly reactive. Avalanche danger is rising — give the new snow time to bond and steer well clear of steep, wind-affected terrain.",
        problems: [
          { type: "Storm Slab", likelihood: "Very Likely", size: "D2",
            aspects: pickAspects(["N", "NW", "NE", "W", "E"], ["mid", "high", "low"]),
            note: "8–16 in of right-side-up storm snow accumulating rapidly with wind." },
          { type: "Wind Slab", likelihood: "Likely", size: "D2",
            aspects: pickAspects(["N", "NE", "E", "SE"], ["mid", "high"]),
            note: "Stiffening slabs forming on all lee aspects with sustained SW flow." },
        ],
        snowpack:
          "Incoming storm snow over a refrozen melt-freeze crust. Bonding of new over old is the primary uncertainty as loading continues.",
      },
    };
    return byMountain[m.id];
  }
  function pickAspects(dirs, bands) {
    const all = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const out = { low: {}, mid: {}, high: {} };
    for (const b of ["low", "mid", "high"]) {
      for (const d of all) out[b][d] = bands.includes(b) && dirs.includes(d);
    }
    return out;
  }

  // ---- SNOTEL ---------------------------------------------------------------
  function buildSnotel(m) {
    const rng = mulberry32(m.snotelId.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    const profiles = {
      "mt-rainier": { depth: 112, swe: 38.2, pct: 108, dir: 1 },
      "mt-baker": { depth: 138, swe: 47.6, pct: 121, dir: 1 },
      "mt-shuksan": { depth: 138, swe: 47.6, pct: 121, dir: 1 },
    };
    const p = profiles[m.id];
    const trend = [];
    let d = p.depth - 26, swe = p.swe - 9;
    for (let i = 29; i >= 0; i--) {
      const day = new Date(NOW.getTime() - i * 86400000);
      d += (0.9 + rng() * 1.4) * p.dir - (rng() < 0.18 ? 2 : 0);
      swe += (0.3 + rng() * 0.55) * p.dir;
      trend.push({ date: dayKey(day), depth: round(clamp(d, 0, 300)), swe: round(swe, 1) });
    }
    const last = trend[trend.length - 1];
    return {
      station: m.snotelStation, stationId: m.snotelId, elev: m.snotelElev,
      depth: last.depth, swe: last.swe, pct: p.pct,
      tMax: round(28 + rng() * 4), tMin: round(14 + rng() * 5),
      precipAccum: round(2.1 + rng(), 1), date: last.date, trend,
    };
  }

  // ---- forecast evolution snapshots (predicting TARGET, taken daily) -------
  function buildSnapshots(m, forecast) {
    // 9 daily snapshots Feb 4 → Feb 12, each a (noisier, earlier) prediction
    // of the target-day summit conditions, converging toward the Feb 12 truth.
    const truth = {
      hrrr: daySummary(forecast.hrrr, TARGET),
      gfs: daySummary(forecast.gfs, TARGET),
      ecmwf: daySummary(forecast.ecmwf, TARGET),
    };
    const rng = mulberry32(m.id.length * 131 + 5);
    const snaps = [];
    for (let i = 8; i >= 0; i--) {
      const taken = new Date("2026-02-04T12:00:00").getTime() + (8 - i) * 86400000;
      const lead = i; // days of lead-time error remaining (8 → 0)
      const spread = lead / 8; // 1 far out → 0 at present
      const models = {};
      for (const k of ["hrrr", "gfs", "ecmwf"]) {
        const tr = truth[k] || truth.gfs;
        if (k === "hrrr" && lead > 2) { models[k] = { available: false }; continue; }
        const j = () => (rng() - 0.5);
        models[k] = {
          available: true,
          high: round(tr.high + j() * 18 * spread),
          maxWind: round(clamp(tr.maxWind + j() * 26 * spread, 2, 100)),
          flNoon: round(clamp(tr.flNoon + j() * 3200 * spread, 600, 11000)),
          precip: round(Math.max(0, tr.precip + j() * 0.5 * spread), 2),
        };
      }
      snaps.push({ takenAt: new Date(taken).toISOString(), models });
    }
    return snaps;
  }

  // ---- satellite ------------------------------------------------------------
  function buildSat(m) {
    return { date: "2026-02-09", cloud: 18, ageDays: 3 };
  }

  // ---- assemble -------------------------------------------------------------
  const DETAILS = {};
  for (const m of MOUNTAINS) {
    const forecast = buildForecast(m);
    DETAILS[m.id] = {
      forecast,
      nwac: buildNwac(m),
      snotel: buildSnotel(m),
      snapshots: buildSnapshots(m, forecast),
      satellite: buildSat(m),
      daily: {
        hrrr: daysFor(forecast.hrrr),
        gfs: daysFor(forecast.gfs),
        ecmwf: daysFor(forecast.ecmwf),
      },
    };
  }
  function daysFor(rows) {
    const keys = [...new Set(rows.filter(Boolean).map((r) => r.t.slice(0, 10)))];
    const out = {};
    for (const k of keys) out[k] = daySummary(rows, k);
    return out;
  }

  // ---- projects (dashboard) -------------------------------------------------
  const PROJECTS = [
    {
      id: "rainier-muir-feb", name: "Camp Muir — Winter Skills", mountainId: "mt-rainier",
      targetStart: TARGET, targetEnd: TARGET_END, status: "active",
      notes: "Two-day skills weekend with an eye on a Muir push if the window holds.",
      lastRefreshed: NOW.toISOString(), party: 4,
    },
    {
      id: "baker-cd-feb", name: "Baker — Coleman-Deming", mountainId: "mt-baker",
      targetStart: "2026-02-14", targetEnd: "2026-02-16", status: "active",
      notes: "Standard route recon. High-pressure window looks promising.",
      lastRefreshed: NOW.toISOString(), party: 2,
    },
    {
      id: "shuksan-fc-feb", name: "Shuksan — Fisher Chimneys", mountainId: "mt-shuksan",
      targetStart: "2026-02-15", targetEnd: "2026-02-15", status: "active",
      notes: "Committing line. Watching the incoming system closely.",
      lastRefreshed: NOW.toISOString(), party: 3,
    },
  ];

  // build dashboard summaries for each project
  function summarize(p) {
    const m = MOUNTAINS.find((x) => x.id === p.mountainId);
    const det = DETAILS[p.mountainId];
    const day = det.daily.gfs[p.targetStart] || det.daily.gfs[Object.keys(det.daily.gfs)[2]];
    const nwac = det.nwac;
    const sno = det.snotel;
    // condition tone: weigh wind, precip, danger, cold
    const score = (day.maxWind > 45 ? 2 : day.maxWind > 32 ? 1 : 0)
      + (day.maxGust > 55 ? 1 : 0)
      + (day.precip > 0.1 ? 2 : day.pop > 50 ? 1 : 0)
      + (nwac.today.high >= 4 ? 2 : nwac.today.high === 3 ? 1 : 0)
      + (day.high < 10 ? 1 : 0);
    const tone = score >= 4 ? "alert" : score >= 2 ? "caution" : "good";
    return {
      mountain: m, day, nwac, snotel: sno,
      summit: m.elevations.summit, freezeNoon: day.flNoon,
      precipType: day.precip > 0.05 ? (m.elevations.mid > day.flNoon ? "snow" : "mixed")
        : (day.pop > 40 ? "chance" : "none"),
      tone,
    };
  }

  window.MWX = {
    times, START, NOW, HOURS, TARGET, TARGET_END,
    MOUNTAINS, PROJECTS, DETAILS,
    getMountain: (id) => MOUNTAINS.find((m) => m.id === id),
    getProject: (id) => PROJECTS.find((p) => p.id === id),
    getDetail: (mountainId) => DETAILS[mountainId],
    summarize,
    daySummary,
    helpers: { round, clamp, dayKey, mulberry32 },
  };
})();
