import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const path = "/my/forever/CAMWOW%20EU4%20Realm%203%20PvE/Kania/enchanting";
const screenshots = fileURLToPath(
  new URL("../../../../artifacts/profession-album/", import.meta.url),
);
test("responsive album, keyboard dialog, URL filters and screenshots", async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [360, 390, 640, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Runed Copper Rod, known", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const small = await page.locator("button, select").evaluateAll((elements) =>
      elements
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.width < 44 || r.height < 44);
        })
        .map((e) => e.textContent),
    );
    expect(small).toEqual([]);
    if (width === 390 || width === 1280)
      await page.screenshot({
        path: `${screenshots}/${width === 390 ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
    const opener = page.getByRole("button", { name: "Runed Copper Rod, known", exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("You know this. Grey at 10.");
    await expect(page.getByRole("button", { name: "Close recipe details" })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (width < 640) expect(Math.round(box!.y + box!.height)).toBe(900);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await page
      .getByRole("button", { name: "Enchant Bracer - Agility, missing, hard", exact: true })
      .click();
    await expect(dialog).toContainText("Formula: Enchant Bracer - Agility");
    if (width === 390 || width === 1280)
      await page.screenshot({
        path: `${screenshots}/${width === 390 ? "mobile" : "desktop"}-detail.png`,
      });
    await page.getByRole("button", { name: "Close recipe details" }).click();
  }
  await page.getByRole("button", { name: "Can get now", exact: true }).click();
  await expect(page).toHaveURL(/\?f=now$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Can get now", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Missing", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Can get now", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("link", { name: "Back to Kania" }).click();
  await expect(page.getByRole("link", { name: "Open collection" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Enchanting skill Plan" })).toBeVisible();
  await page.getByRole("link", { name: "Open collection" }).first().click();
  await expect(page.getByRole("heading", { name: "Enchanting", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("Kania empty and unopened Enchanting, known Tailoring, and Retail", async ({ page }) => {
  await page.goto(`${path}?state=unopened`);
  await expect(
    page.getByText("Open your Enchanting window in the game once, then this fills in"),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/unopened.png`, fullPage: true });
  await page.goto(`${path}?state=empty`);
  await expect(page.locator(".recipe-slot")).toHaveCount(262);
  await expect(page.locator(".recipe-slot.is-known")).toHaveCount(0);
  await page.screenshot({ path: `${screenshots}/empty.png`, fullPage: true });
  await page.goto(path.replace("enchanting", "tailoring"));
  await expect(page.locator(".recipe-slot.is-known")).toHaveCount(7);
  await expect(page.getByText("112 / 150")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/tailoring.png`, fullPage: true });
  await page.goto(`${path.replace("forever", "retail")}?game=retail`);
  await expect(page.locator(".recipe-slot")).toHaveCount(262);
});

test("Today fixture cards persist browser hints, link from the character and fit desktop and mobile", async ({
  page,
}) => {
  const todayScreenshots = fileURLToPath(
    new URL("../../../../artifacts/today-goals/", import.meta.url),
  );
  await mkdir(todayScreenshots, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${path}?state=unopened`);
    await expect(page.getByRole("heading", { name: "Today in Enchanting" })).toBeVisible();
    await expect(page.locator(".today-card")).toHaveCount(1);
    await expect(page.locator(".today-card")).toContainText("Open your Enchanting window once");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `${todayScreenshots}/${width === 390 ? "mobile" : "desktop"}-unopened.png`,
      fullPage: true,
    });
    await page.goto(path);
    await expect(page.locator(".today-card")).toHaveCount(3);
    await page.screenshot({
      path: `${todayScreenshots}/${width === 390 ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
  }
  const first = page.locator(".today-card").first();
  await first.getByRole("button", { name: "Mark done" }).click();
  await page.reload();
  await expect(first.getByRole("button", { name: "Done ✓" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await first.getByRole("button", { name: "Done ✓" }).click();
  await page.getByRole("link", { name: "Back to Kania" }).click();
  await expect(page.locator(".today-strip li")).toHaveCount(2);
  await page.locator(".today-strip a").first().click();
  await expect(page.getByRole("heading", { name: "Today in Enchanting" })).toBeVisible();
  await page.goto(`${path}?state=unopened`);
  await expect(
    page.locator(".today-card").getByRole("button", { name: "Mark done" }),
  ).toBeVisible();
});
