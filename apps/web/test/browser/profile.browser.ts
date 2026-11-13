import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const screenshots = fileURLToPath(new URL("../../../../artifacts/profile-home/", import.meta.url));
for (const width of [360, 390, 768, 1280])
  test(`picked profile fits ${width}px with keyboard-accessible journey`, async ({ page }) => {
    await mkdir(screenshots, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/my?profile=1");
    await expect(page.getByRole("heading", { level: 1, name: "Kania" })).toBeVisible();
    await expect(page.getByText("18,993 / 34,000 XP", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const journey = page.getByRole("region", { name: "Your journey, oldest to newest" });
    await journey.focus();
    await expect(journey).toBeFocused();
    if (width < 768) {
      expect(await journey.evaluate((e) => e.scrollWidth)).toBeGreaterThan(
        await journey.evaluate((e) => e.clientWidth),
      );
      await page.keyboard.press("End");
    }
    await journey.evaluate((e) => {
      e.scrollLeft = 0;
      (e as HTMLElement).blur();
    });
    await page.screenshot({ path: `${screenshots}/${width}-profile.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
