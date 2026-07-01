import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

/* Focused (in range): target day highlighted; evolution chart present; notes editable + persist.
   We seed the pin in localStorage so notes bind to it, then navigate with ?target. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

// Seed once (idempotent): only writes the pin if none exists yet, so a reload after the
// user edits notes does NOT clobber the edited value back to the empty seed.
async function seedPin(page: import("@playwright/test").Page, target: string) {
  await page.addInitScript(
    ([t]) => {
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
    },
    [target],
  );
}

test("focused in-range view highlights the target and shows the evolution chart", async ({
  page,
}, ti) => {
  await seedPin(page, TARGET_IN_RANGE);
  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);

  // DateSelector headline copy (in range).
  await expect(page.getByText(/Planning for/i).first()).toBeVisible();
  await expect(page.getByText(/in range/i).first()).toBeVisible();
  // The convergence "call" chart panel is present.
  await expect(page.getByText(/is your day'?s forecast settling/i)).toBeVisible();
  // The target day is highlighted in the outlook (a "Target" flag + .is-target tile).
  await expect(page.locator(".day-tile.is-target").first()).toBeVisible();
  await expect(page.getByText("Target", { exact: true }).first()).toBeVisible();

  await page.screenshot({ path: ti.outputPath("focused-in-range.png"), fullPage: true });
});

test("notes are editable and persist across reload", async ({ page }) => {
  await seedPin(page, TARGET_IN_RANGE);
  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);

  const notes = page.getByRole("textbox", { name: /trip notes/i });
  await expect(notes).toBeVisible();
  await notes.fill("Glissade descent if the snow softens.");

  await page.reload();
  await expect(page.getByRole("textbox", { name: /trip notes/i })).toHaveValue(
    /glissade descent/i,
  );

  // And it lives on the pin.
  const pins = await page.evaluate(() => JSON.parse(localStorage.getItem("cascast.pins") ?? "[]"));
  expect(pins[0].notes).toContain("Glissade descent");
});
