import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";
import * as path from "node:path";

/* Visual QA for the 2026-06-16 Daily Outlook fixes:
   (1) desktop day-header row stretches to full width in sync with the tile grid;
   (2) per-day stepwise expand (one level finer) + collapse (one level coarser) controls.
   Saves panel screenshots to qa-screenshots/ for human review. */

const OUT = path.resolve(process.cwd(), "qa-screenshots");
const shot = (name: string, project: string) => path.join(OUT, `${name}-${project}.png`);

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
  await page.addInitScript((t) => {
    if (localStorage.getItem("cascast.pins")) return;
    localStorage.setItem(
      "cascast.pins",
      JSON.stringify([
        {
          mountainId: "mt-rainier",
          name: "Mount Rainier",
          targetDate: t,
          notes: "",
          createdAt: new Date().toISOString(),
        },
      ]),
    );
  }, TARGET_IN_RANGE);
});

test("daily outlook: full-width headers + stepwise expand/collapse", async ({ page }, ti) => {
  const proj = ti.project.name;
  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);

  const panel = page.locator(".daily").first();
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();

  // (1) Baseline: header groups + tile grid. On desktop the header row should
  // fill the full panel width (the fix). Capture the panel.
  await expect(page.locator(".daily-groups").first()).toBeVisible();
  await page.screenshot({ path: shot("daily-baseline", proj), fullPage: false });
  await panel.screenshot({ path: shot("daily-panel-baseline", proj) });

  // Verify header row width ≈ grid row width (the desync fix). Allow 2px slack.
  const groupsBox = await page.locator(".daily-groups").first().boundingBox();
  const gridBox = await page.locator(".daily-grid").first().boundingBox();
  expect(groupsBox).not.toBeNull();
  expect(gridBox).not.toBeNull();
  if (groupsBox && gridBox) {
    expect(Math.abs(groupsBox.width - gridBox.width)).toBeLessThanOrEqual(2);
  }

  // (2) Expand one day one level (Daily → AM·Mid·PM).
  const expand = page.getByRole("button", { name: /expand .* detail/i }).first();
  await expand.click();
  await expect(page.getByRole("button", { name: /collapse .* to /i }).first()).toBeVisible();
  await panel.screenshot({ path: shot("daily-panel-expanded-1", proj) });

  // Expand again where available (→ Hourly) for the same first day.
  const expand2 = page.getByRole("button", { name: /expand .* to hourly/i }).first();
  if (await expand2.count()) {
    await expand2.click();
    await panel.screenshot({ path: shot("daily-panel-expanded-2", proj) });
  }

  // (3) Collapse one level via the back control.
  const collapse = page.getByRole("button", { name: /collapse .* to /i }).first();
  await collapse.click();
  await panel.screenshot({ path: shot("daily-panel-collapsed-1", proj) });
});
