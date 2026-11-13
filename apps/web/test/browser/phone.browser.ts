import { expect, test } from "@playwright/test";

for (const width of [360, 390, 768, 1280]) {
  test(`phone sign-in fits at ${width}px and generates the QR locally`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const external: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1:4178")) external.push(request.url());
    });
    await page.goto("/my");
    await page.getByRole("button", { name: "Open on phone", exact: true }).click();
    const qr = page.getByRole("img", { name: "Scan to sign in on your phone" });
    await expect(qr).toBeVisible();
    expect((await qr.boundingBox())!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const url = await page.getByLabel("Sign-in link").inputValue();
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect(page.getByRole("status")).toContainText("Copied");
    expect(external).toEqual([]);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(qr).toHaveCount(0);
    await expect(page.getByLabel("Sign-in link")).toHaveCount(0);
  });
}
