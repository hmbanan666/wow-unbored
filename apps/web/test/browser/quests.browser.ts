import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const screenshots = path.resolve("../../artifacts/forever-quests");
for (const width of [390, 1280])
  test(`quest pages and chain progress at ${width}px`, async ({ page }) => {
    await mkdir(screenshots, { recursive: true });
    await page.setViewportSize({ width, height: 950 });
    for (const [slug, name] of [
      ["", "index"],
      ["/a-beginning", "quest"],
      ["/chains/first-steps", "chain"],
    ] as const) {
      await page.goto(`/forever/quests${slug}?overlay=1`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (name === "quest") await expect(page.getByText("Kania", { exact: true })).toBeVisible();
      if (name === "chain") await expect(page.getByText("· Next step")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: path.join(screenshots, `${width}-${name}.png`),
        fullPage: true,
      });
    }
  });
