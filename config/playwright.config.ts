import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Playwright compiles this config to CommonJS (package.json has no "type":"module"),
// so __dirname is native here. Do NOT use import.meta.url — it forces ESM loading of
// the CJS-compiled output and throws "exports is not defined in ES module scope".
const remote = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: path.join(__dirname, "../tests/e2e"),
  fullyParallel: true,
  // One retry absorbs environmental flakes (e.g. a tight assertion timeout under the heavier
  // parallel load the WebGL 3D specs add); pairs with trace: "on-first-retry".
  retries: 1,
  reporter: [["html", { open: "never" }]],
  use: { baseURL: remote ?? "http://localhost:3000", trace: "on-first-retry" },
  webServer: remote
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // Route handlers never execute locally (Playwright intercepts the client fetches),
        // but next build/start read these lazily; provide dummy values so boot never blocks
        // on missing GCP creds.
        env: {
          GCP_PROJECT: "mountain-weatherman-app",
          GCS_BUCKET_WEATHER: "dev-weather",
          GCS_BUCKET_SATELLITE: "dev-satellite-tiles",
        },
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["iPhone 12"] } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 600, height: 900 } } },
  ],
});
