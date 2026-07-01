/* qa-convergence-charts.spec.ts — VISUAL CAPTURE ONLY (no assertions).

   Captures element-scoped screenshots of the two reworked charts —
   CallChart (forecast tab) and ForecastEvolutionChart (Model Lab) — across both
   themes × desktop/mobile widths, into qa-screenshots/convergence/ for review.

   Gated behind QA_CHARTS=1 so it never runs in the normal `npm run test:e2e` gate.
   Run: QA_CHARTS=1 npx playwright test --config config/playwright.config.ts \
        tests/e2e/qa-convergence-charts.spec.ts --project=desktop */
import { test } from "@playwright/test";
import path from "node:path";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

const OUT = path.resolve(process.cwd(), "qa-screenshots", "convergence");
const THEMES = ["glacier", "slate"] as const; // glacier = light, slate = dark
const WIDTHS = [1280, 390] as const;
const SLUG = "mt-rainier";

type Chart = { name: string; url: string; ariaKey: string };
const CHARTS: Chart[] = [
  { name: "callchart", url: `/mountains/${SLUG}?target=${TARGET_IN_RANGE}`, ariaKey: "Forecast convergence" },
  { name: "evolution", url: `/mountains/${SLUG}/models?target=${TARGET_IN_RANGE}`, ariaKey: "Forecast evolution" },
];

test.describe("@qa-charts convergence capture", () => {
  test.skip(!process.env.QA_CHARTS, "set QA_CHARTS=1 to run the capture");
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "capture runs against the local route-mocked build");

  for (const chart of CHARTS) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        test(`${chart.name} · ${theme} · ${width}`, async ({ page }) => {
          await page.addInitScript(
            ([t, target]) => {
              localStorage.setItem("cascast.theme", t as string);
              document.documentElement.dataset.theme = t as string;
              if (!localStorage.getItem("cascast.pins")) {
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
            [theme, TARGET_IN_RANGE] as const,
          );
          await maybeInstallMocks(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(chart.url);
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(700); // let the SVG chart settle

          // The chart's root <div> is the DIRECT parent of its aria-labelled <svg>
          // (heading + chip + svg + legend + caption); :has(> svg) targets it precisely.
          const panel = page.locator(`div:has(> svg[aria-label*="${chart.ariaKey}"])`);
          await panel.scrollIntoViewIfNeeded();
          await panel.screenshot({
            path: path.join(OUT, `${chart.name}__${theme}__${width}.png`),
          });
        });
      }
    }
  }
});
