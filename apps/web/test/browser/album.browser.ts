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
  for (const width of [360, 390, 768, 1366]) {
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
        else {
          const prompt = page.locator(".character-check details");
          await prompt.locator("summary").click();
          await expect(prompt.getByRole("link", { name: "Install Bory" })).toHaveAttribute(
            "href",
            "/install",
          );
          await expect(
            prompt.getByRole("link", { name: "Sign in from the Companion" }),
          ).toHaveAttribute("href", "/install#sign-in");
          await prompt.locator("summary").click();
        }
        if (kind === "professions") {
          await expect(page.locator(".directory li a")).toHaveCount(12);
          await expect(page.locator(".directory .known")).toHaveCount(0);
          if (overlay) {
            await expect(page.locator(".character-check > p")).toHaveText(
              "Open Enchanting in game to check Kania’s recipes.",
            );
            await expect(
              page.locator(".today-card, .collection-ring, .missing-section"),
            ).toHaveCount(0);
          } else {
            await expect(page.locator(".collection-ring")).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Missing", exact: true })).toHaveCount(0);
          }
        } else {
          await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
          if (overlay)
            await expect(
              page
                .locator(".character-check > p")
                .filter({ hasText: "Kania hasn’t checked this recipe yet." }),
            ).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width === 390 || width === 1366)
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
  await page.getByRole("button", { name: "Show more recipes" }).click();
  await expect(page.locator(".directory .known")).toHaveCount(7);
  const line = page.locator(".character-check > p");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Kania knows 7 of 16 recipes.");
  await expect(line.getByRole("link")).toHaveCount(1);
  await expect(line.getByRole("link")).toHaveAttribute("href", /^\/forever\/recipes\//);
  await mkdir(screenshots, { recursive: true });
  for (const width of [390, 1366]) {
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
    .getByRole("combobox", { name: "Filter recipes", exact: true })
    .selectOption({ label: "Linen" });
  await expect(page).toHaveURL(/f=category/);
  await expect(page.locator(".directory li a")).toHaveCount(7);
  const picker = page.getByRole("combobox", { name: "Character", exact: true });
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Pick a WoW Forever character" })).toBeVisible();
  await expect(page.locator(".collection-ring")).toHaveCount(0);
  await expect(page.locator(".today-card")).toHaveCount(0);
  await picker.selectOption({ label: "Kania · 23 WARLOCK · CAMWOW EU4 Realm 3 PvE" });
  await expect(page.locator(".directory .known")).toHaveCount(7);
  await page.locator(".directory li a").first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/forever\/recipes\//);
});

test("the recipe check gives one fact and one link without moving the public answer", async ({
  page,
}) => {
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, fact] of [
      ["runed-copper-rod", "Kania knows this recipe."],
      ["arcane-forge", "Kania hasn’t learned this. Needs Enchanting 300, has 145."],
    ] as const) {
      const path = "/forever/recipes/" + slug;
      await page.goto(path);
      const materials = page.getByRole("heading", { name: "Materials" });
      const before = await materials.boundingBox();
      await page.goto(path + "?overlay=1&learned=1");
      const check = page.getByRole("complementary", { name: "Check my character" });
      await expect(check.locator(":scope > p")).toContainText(fact);
      await expect(check.getByRole("link")).toHaveCount(1);
      expect(await materials.boundingBox()).toEqual(before);
      if (width === 1366) {
        const lines = await check
          .locator("p")
          .evaluate((p) => p.clientHeight / parseFloat(getComputedStyle(p).lineHeight));
        expect(lines).toBeCloseTo(1, 1);
      }
      if (slug === "arcane-forge")
        await page.screenshot({ path: `${screenshots}/${width}-recipe-skill.png` });
    }
  }
});

test("signed-out My page explains the actual sign-in step", async ({ page }) => {
  await page.goto("/my");
  await expect(page.getByText("Open my profile", { exact: true })).toBeVisible();
  await page.getByText("Settings", { exact: true }).click();
  await expect(page.getByRole("link", { name: "How to sign in" })).toHaveAttribute(
    "href",
    "/install#sign-in",
  );
  await expect(page.getByRole("button", { name: "Open on phone" })).toHaveCount(0);
});
