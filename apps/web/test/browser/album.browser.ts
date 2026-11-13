import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const screenshots = fileURLToPath(
  new URL("../../../../artifacts/public-professions/", import.meta.url),
);

test("public album and recipe pages fit mobile and desktop, with anonymous and personal fixture screenshots", async ({
  page,
}) => {
  await mkdir(screenshots, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const overlay of [false, true]) {
      const suffix = overlay ? "?overlay=1" : "";
      for (const [kind, slug] of [
        ["professions", "enchanting"],
        ["recipes", "runed-copper-rod"],
      ]) {
        await page.goto(`/forever/${kind}/${slug}${suffix}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (overlay)
          await expect(
            page.getByRole("combobox", { name: "Character", exact: true }),
          ).toBeVisible();
        else
          await expect(
            page.getByRole("link", { name: "Sign in from the Companion" }),
          ).toBeVisible();
        if (kind === "professions") {
          await expect(page.locator(".recipe-slot")).toHaveCount(262);
          await expect(page.locator(".recipe-slot.is-known")).toHaveCount(0);
          if (overlay) {
            await expect(page.getByRole("heading", { name: "Today in Enchanting" })).toBeVisible();
            await expect(page.locator(".today-card")).toContainText(
              "Open your Enchanting window once",
            );
          } else {
            await expect(page.locator(".collection-ring")).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Missing", exact: true })).toHaveCount(0);
          }
        } else {
          await expect(page.getByRole("heading", { name: "Base difficulty" })).toBeVisible();
          if (overlay)
            await expect(
              page.getByRole("heading", { name: "Kania has not checked this yet" }),
            ).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width === 390 || width === 1280)
          await page.screenshot({
            path: `${screenshots}/${width}-${kind}-${overlay ? "overlay" : "anonymous"}.png`,
            fullPage: true,
          });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("picker clears overlays for the other game; category filters and known Tailoring stay accessible", async ({
  page,
}) => {
  await page.goto("/forever/professions/tailoring?overlay=1");
  await expect(page.locator(".recipe-slot.is-known")).toHaveCount(7);
  await expect(page.getByText("112 / 150", { exact: true })).toBeVisible();
  await mkdir(screenshots, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `${screenshots}/${width}-tailoring-overlay.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Linen" });
  await expect(page).toHaveURL(/f=category/);
  await expect(page.locator(".recipe-slot.is-dimmed")).toHaveCount(9);
  const picker = page.getByRole("combobox", { name: "Character", exact: true });
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Pick a WoW Forever character in the header")).toBeVisible();
  await expect(page.locator(".collection-ring")).toHaveCount(0);
  await expect(page.locator(".today-card")).toHaveCount(0);
  await picker.selectOption({ label: "Kania · 23 WARLOCK · CAMWOW EU4 Realm 3 PvE" });
  await expect(page.locator(".recipe-slot.is-known")).toHaveCount(7);
  await page.locator(".recipe-slot").first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/forever\/recipes\//);
});
