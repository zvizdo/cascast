/* qa-mobile-polish.spec.ts — VISUAL CAPTURE ONLY (no assertions).

   Sweeps every page/tab-state across 3 mobile widths × both themes and saves a full-page
   screenshot per combination to qa-screenshots/polish/ for human + subagent review.

   Gated behind QA_POLISH=1 so it never runs in the normal `npm run test:e2e` gate.
   Run: QA_POLISH=1 npx playwright test --config config/playwright.config.ts \
        tests/e2e/qa-mobile-polish.spec.ts --project=mobile
   (project=mobile gives iPhone-12 hasTouch/isMobile so `pointer:coarse` mobile CSS applies;
    we override the width per capture to 360/390/412.) */
import { test } from "@playwright/test";
import path from "node:path";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

const OUT = path.resolve(process.cwd(), "qa-screenshots", "polish");
const WIDTHS = [360, 390, 412];
const THEMES = ["slate", "glacier"] as const; // slate = dark, glacier = light
const SLUG = "mt-rainier";

type State = { name: string; url: string; pin: boolean };
const STATES: State[] = [
  { name: "home", url: "/", pin: false },
  { name: "your-mountains", url: "/your-mountains", pin: true },
  { name: "detail-forecast", url: `/mountains/${SLUG}`, pin: false },
  { name: "detail-safety", url: `/mountains/${SLUG}?tab=safety`, pin: false },
  { name: "detail-terrain", url: `/mountains/${SLUG}?tab=terrain`, pin: false },
  { name: "focused-forecast", url: `/mountains/${SLUG}?target=${TARGET_IN_RANGE}`, pin: true },
  { name: "model-lab", url: `/mountains/${SLUG}/models`, pin: false },
  { name: "explore-3d", url: `/mountains/${SLUG}/3d`, pin: false },
  { name: "sources", url: "/sources", pin: false },
];

test.describe("@qa-polish mobile capture", () => {
  test.skip(!process.env.QA_POLISH, "set QA_POLISH=1 to run the capture");
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "capture runs against the local route-mocked build");

  for (const state of STATES) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        test(`${state.name} · ${theme} · ${width}`, async ({ page }) => {
          // Seed theme (and pin where the page needs one) BEFORE any page script runs.
          await page.addInitScript(
            ([t, doPin, target]) => {
              localStorage.setItem("cascast.theme", t as string);
              document.documentElement.dataset.theme = t as string;
              if (doPin && !localStorage.getItem("cascast.pins")) {
                localStorage.setItem(
                  "cascast.pins",
                  JSON.stringify([
                    {
                      mountainId: "mt-rainier",
                      name: "Mount Rainier",
                      targetDate: target,
                      notes: "",
                      createdAt: new Date().toISOString(),
                    },
                  ]),
                );
              }
            },
            [theme, state.pin, TARGET_IN_RANGE] as const,
          );
          await maybeInstallMocks(page);
          await page.setViewportSize({ width, height: 844 });
          await page.goto(state.url);
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(900); // let SVG charts / map / terrain settle
          await page.screenshot({
            path: path.join(OUT, `${state.name}__${theme}__${width}.png`),
            fullPage: true,
          });
        });
      }
    }
  }
});
