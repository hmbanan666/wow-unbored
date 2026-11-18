import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const screenshots = fileURLToPath(new URL("../../../../artifacts/profile-home/", import.meta.url));
for (const width of [360, 390, 768, 1366])
  test(`picked profile fits ${width}px with profession links and collapsed Settings`, async ({
    page,
  }) => {
    await mkdir(screenshots, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/my?profile=1");
    await expect(page.getByRole("heading", { level: 1, name: "My page" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Enchanting.*42 recipes known/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(page.getByRole("combobox", { name: "Character", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Open on phone" })).toBeHidden();
    await page.getByText("Settings", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Open on phone" })).toBeVisible();
    await page.keyboard.press("Enter");
    await page.screenshot({ path: `${screenshots}/${width}-profile.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
