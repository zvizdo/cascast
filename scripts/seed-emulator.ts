import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { seedMountains } from "./seed-mountains";

// Anchor date for relative fixtures (stale satellite = anchor - 20 days).
const ANCHOR = new Date("2026-08-02T12:00:00Z");
const daysBefore = (d: Date, n: number) =>
  new Date(d.getTime() - n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  // Allow emulator seeding, OR cloud seeding into an explicit NAMED, non-default
  // database (e.g. dev-db). Refusing "(default)" means prod can never be
  // fixture-polluted by this script.
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const cloudDb = process.env.FIRESTORE_DATABASE;
  if (!emulator && (!cloudDb || cloudDb === "(default)")) {
    throw new Error(
      "Refusing to seed: set FIRESTORE_EMULATOR_HOST (emulator) or " +
        "FIRESTORE_DATABASE=<named non-default db, e.g. dev-db> (cloud dev).",
    );
  }
  if (!getApps().length) {
    initializeApp({ projectId: process.env.GCP_PROJECT ?? "mountain-weatherman-app" });
  }
  const firestore = !emulator && cloudDb ? getFirestore(getApp(), cloudDb) : getFirestore();
  const n = await seedMountains();
  const projects = firestore.collection("projects");

  // Happy-path, fully-populated project for units / a11y / share tests.
  // Seeded under both ids: proj-rainier (P6 fixtures) and sample-rainier (existing e2e specs).
  const rainier = {
    name: "Rainier — Demo Weekend", mountainId: "mt-rainier",
    mountainName: "Mount Rainier", mountainSlug: "mt-rainier",
    targetDateStart: "2026-08-02", targetDateEnd: "2026-08-03",
    status: "active", notes: "", createdAt: ANCHOR,
    lastRefreshedAt: ANCHOR.toISOString(), lastRefreshStatus: "ok",
    currentSummary: {
      targetDateHigh: 38, targetDateLow: 24, targetDateWind: 22, targetDatePrecip: 0.2,
      freezingLevelFt: 9800, precipType: "snow" as const, summaryModel: "hrrr" as const,
      tone: "caution" as const,
      verdict: "Cold and breezy with light snow up high — climbable but plan for wind.",
      updatedAt: ANCHOR.toISOString(),
    },
  };
  await projects.doc("proj-rainier").set(rainier, { merge: true });
  await projects.doc("sample-rainier").set(rainier, { merge: true });

  // Pending first refresh — no currentSummary (Task 5a).
  await projects.doc("proj-pending").set(
    {
      name: "Baker — First Look", mountainId: "mt-baker",
      mountainName: "Mount Baker", mountainSlug: "mt-baker",
      targetDateStart: "2026-08-10", targetDateEnd: "2026-08-11",
      status: "active", notes: "", createdAt: ANCHOR,
      lastRefreshedAt: null, lastRefreshStatus: "pending",
    },
    { merge: true },
  );

  // Thin history — only 2 weather snapshots (Task 5b).
  await projects.doc("proj-thin").set(
    {
      name: "Stuart — Tracking", mountainId: "mt-stuart",
      mountainName: "Mount Stuart", mountainSlug: "mt-stuart",
      targetDateStart: "2026-08-05", targetDateEnd: "2026-08-06",
      status: "active", notes: "", createdAt: ANCHOR,
      lastRefreshedAt: ANCHOR.toISOString(), lastRefreshStatus: "ok",
      currentSummary: {
        targetDateHigh: 52, targetDateLow: 36, targetDateWind: 14, targetDatePrecip: 0,
        freezingLevelFt: 12500, precipType: "none", summaryModel: "gfs",
        tone: "good", verdict: "Calm and clear — a great window.",
        updatedAt: ANCHOR.toISOString(),
      },
    },
    { merge: true },
  );
  const thinSnaps = projects.doc("proj-thin").collection("weatherSnapshots");
  for (let i = 0; i < 2; i++) {
    await thinSnaps.doc(`snap-${i}`).set({
      id: `snap-${i}`, fetchedAt: daysBefore(ANCHOR, 2 - i), targetDate: "2026-08-05",
      source: "live",
      models: {
        hrrr: { available: true, summitHighF: 50 + i, summitLowF: 34, summitMaxWindMph: 14,
          summitMaxSustainedWindMph: 10, summitPrecipIn: 0, freezingLevelFtNoon: 12000, snowfallIn: 0 },
        gfs: { available: true, summitHighF: 51 + i, summitLowF: 35, summitMaxWindMph: 13,
          summitMaxSustainedWindMph: 9, summitPrecipIn: 0, freezingLevelFtNoon: 12200, snowfallIn: 0 },
        ecmwf: { available: true, summitHighF: 52 + i, summitLowF: 36, summitMaxWindMph: 12,
          summitMaxSustainedWindMph: 8, summitPrecipIn: 0, freezingLevelFtNoon: 12400, snowfallIn: 0 },
      },
    });
  }

  // Summer / off-season NWAC (Task 5c).
  await projects.doc("proj-summer").set(
    {
      name: "Shuksan — Summer", mountainId: "mt-shuksan",
      mountainName: "Mount Shuksan", mountainSlug: "mt-shuksan",
      targetDateStart: "2026-08-02", targetDateEnd: "2026-08-03",
      status: "active", notes: "", createdAt: ANCHOR,
      lastRefreshedAt: ANCHOR.toISOString(), lastRefreshStatus: "ok",
      currentAvalancheSummary: {
        dangerUpper: 0, dangerMiddle: 0, dangerLower: 0, bottomLine: "",
        forecastDate: "2026-08-02", season: "summer", updatedAt: ANCHOR.toISOString(),
      },
    },
    { merge: true },
  );
  await firestore.collection("nwacForecasts").doc("mt-shuksan-zone").set({
    zoneId: "mt-shuksan-zone", zoneName: "Mt Baker", season: "summer",
    productType: "summary", danger: [], bottomLine: null,
  });

  // Stale satellite (>14 days old) and no-scene satellite (Task 5d, 5e).
  await firestore.collection("satelliteCache").doc("mt-stale").set({
    mountainId: "mt-stale", latestImageDate: daysBefore(ANCHOR, 20),
    cloudCoverPercent: 8, tileUrlTemplate: "", tileSource: "eox-s2cloudless",
    attribution: "Sentinel-2 cloudless — EOX", boundingBox: { north: 0, south: 0, east: 0, west: 0 },
  });
  await firestore.collection("satelliteCache").doc("mt-noscene").set({
    mountainId: "mt-noscene", latestImageDate: null,
    cloudCoverPercent: null, tileUrlTemplate: "", tileSource: "eox-s2cloudless",
    attribution: "Sentinel-2 cloudless — EOX", boundingBox: { north: 0, south: 0, east: 0, west: 0 },
  });

  console.log(
    `Emulator seeded: ${n} mountains + projects [proj-rainier, proj-pending, proj-thin, proj-summer]` +
      ` + nwacForecasts/mt-shuksan-zone + satelliteCache/[mt-stale, mt-noscene].`,
  );
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
