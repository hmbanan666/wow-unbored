import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const screenshots = path.resolve("../../artifacts/character-feed");
for (const width of [390, 1280])
  test(`character and community feeds at ${width}px`, async ({ page }) => {
    await mkdir(screenshots, { recursive: true });
    await page.setViewportSize({ width, height: 950 });
    for (const [url, name] of [
      ["/forever/players/camwow-eu4-realm-3-pve/kania", "character"],
      ["/forever/players/camwow-eu4-realm-3-pve/kania?overlay=1", "owner"],
      ["/forever/players/camwow-eu4-realm-3-pve/kania?shared=0", "unshared"],
      ["/forever/feed", "community"],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (name === "owner") await expect(page.getByRole("switch")).toBeVisible();
      else await expect(page.getByRole("switch")).toHaveCount(0);
      if (name === "unshared") {
        await expect(page.getByText("This character has not shared a feed")).toBeVisible();
        await expect(page.locator("article")).toHaveCount(0);
      } else await expect(page.getByRole("heading", { name: "Level 25" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: path.join(screenshots, `${width}-${name}.png`),
        fullPage: true,
      });
    }
  });
