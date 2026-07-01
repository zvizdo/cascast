import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

/* Shareable link: a fresh context (empty localStorage) navigating directly to a focused URL
   renders the focused view (target from URL); notes start empty. Also verifies copy-link. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("a direct focused link renders without a pre-existing pin", async ({ page }, ti) => {
  // No seeded pin — simulates a shared link in a fresh browser.
  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);

  await expect(page.getByText(/in range/i).first()).toBeVisible();
  await expect(page.getByText(/is your day'?s forecast settling/i)).toBeVisible();

  // Notes start empty (no pin yet).
  await expect(page.getByRole("textbox", { name: /trip notes/i })).toHaveValue("");

  // localStorage has no pin until the user edits notes.
  const pins = await page.evaluate(() => JSON.parse(localStorage.getItem("cascast.pins") ?? "[]"));
  expect(pins).toHaveLength(0);

  await page.screenshot({ path: ti.outputPath("shareable-focused.png"), fullPage: true });
});

// WebKit (the iPhone 12 device default) rejects the clipboard-write permission, so we grant
// clipboard perms + read the clipboard back only on Chromium; everywhere we assert the visible
// "Copied" confirmation (the user-facing signal).
test.describe("copy link", () => {
  test("the copy-link button copies the current focused URL", async ({ page, browserName }) => {
    if (browserName === "chromium") {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);
    const share = page.getByRole("button", { name: /copy link to this page/i }).first();
    await expect(share).toBeVisible();
    await share.click();

    // Visible confirmation flips to "Copied" on success (all browsers).
    await expect(page.getByText(/copied/i).first()).toBeVisible();

    if (browserName === "chromium") {
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip).toContain(`/mountains/mt-rainier`);
      expect(clip).toContain(`target=${TARGET_IN_RANGE}`);
    }
  });
});
