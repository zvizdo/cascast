import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

/* Your Mountains: empty → empty state + CTA; with a pin → tile w/ target date + focused link;
   Remove → tile gone. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("empty state shows the pin-a-mountain CTA", async ({ page }, ti) => {
  await page.goto("/your-mountains");
  await expect(page.getByRole("heading", { name: /no pinned mountains yet/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /pin a mountain/i })).toBeVisible();
  await page.screenshot({ path: ti.outputPath("your-mountains-empty.png"), fullPage: true });
});

test("a pinned mountain renders a tile and Remove deletes it", async ({ page }, ti) => {
  await page.addInitScript(
    ([t]) => {
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
    [TARGET_IN_RANGE],
  );
  await page.goto("/your-mountains");

  // Tile present with the target date + a focused link.
  await expect(page.getByText(/mount rainier/i).first()).toBeVisible();
  await expect(page.getByText(TARGET_IN_RANGE)).toBeVisible();
  const focusedLink = page.getByRole("link", { name: /mount rainier/i }).first();
  await expect(focusedLink).toHaveAttribute("href", `/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);
  await page.screenshot({ path: ti.outputPath("your-mountains-pinned.png"), fullPage: true });

  // Remove → tile gone, empty state returns.
  await page.getByRole("button", { name: /remove/i }).click();
  await expect(page.getByText(TARGET_IN_RANGE)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /no pinned mountains yet/i })).toBeVisible();
});

test("the focused link from a tile opens the focused view", async ({ page }) => {
  await page.addInitScript(
    ([t]) => {
      localStorage.setItem(
        "cascast.pins",
        JSON.stringify([
          { mountainId: "mt-rainier", name: "Mount Rainier", targetDate: t, notes: "", createdAt: new Date().toISOString() },
        ]),
      );
    },
    [TARGET_IN_RANGE],
  );
  await page.goto("/your-mountains");
  await page.getByRole("link", { name: /mount rainier/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/mountains/mt-rainier\\?target=${TARGET_IN_RANGE}$`));
});
