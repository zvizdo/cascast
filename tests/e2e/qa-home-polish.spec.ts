/* qa-home-polish.spec.ts — VISUAL CAPTURE ONLY for the home page (/), both themes.

   Full-page screenshots of `/` in glacier (light) + slate (dark), captured under every
   configured Playwright project (desktop 1280×800, mobile iPhone 12, …) → the reviewer's
   evidence for the Task 6 UI/UX polish loop. No assertions.

   Gated behind QA_HOME=1 so it never runs in the normal `npm run test:e2e` gate.
   Run: QA_HOME=1 npx playwright test --config config/playwright.config.ts \
        tests/e2e/qa-home-polish.spec.ts */
import { test } from "@playwright/test";
import path from "node:path";
import { maybeInstallMocks } from "./_mock";

const OUT = path.resolve(process.cwd(), "qa-screenshots", "home-polish");
const THEMES = ["glacier", "slate"] as const; // glacier = light, slate = dark

test.describe("@qa-home home capture", () => {
  test.skip(!process.env.QA_HOME, "set QA_HOME=1 to run the capture");
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "capture runs against the local route-mocked build");

  for (const theme of THEMES) {
    test(`home · ${theme}`, async ({ page }, ti) => {
      // Seed the theme BEFORE any page script runs (ThemeToggle reads cascast.theme on mount).
      await page.addInitScript((t) => {
        localStorage.setItem("cascast.theme", t as string);
        document.documentElement.dataset.theme = t as string;
      }, theme);
      await maybeInstallMocks(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(600); // let the hero ridge SVG + cards settle
      await page.screenshot({
        path: path.join(OUT, `home__${theme}__${ti.project.name}.png`),
        fullPage: true,
      });
    });
  }
});
