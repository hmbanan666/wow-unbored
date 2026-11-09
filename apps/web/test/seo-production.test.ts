import { mkdtemp, rm } from "node:fs/promises";
import sharp from "sharp";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { testDatabase } from "../../server/test/postgres-db.ts";
import { seedSeoContent } from "./seo-fixture.ts";

const enabled = process.env.UNBORED_WEB_SEO_TEST === "1";
const productionTest = test.skipIf(!enabled);
let database: Awaited<ReturnType<typeof testDatabase>>;
let server: ChildProcess;
let origin: string;
let mediaDir: string;
const windows: Window[] = [];

beforeAll(async () => {
  if (!enabled) return;
  database = await testDatabase();
  await seedSeoContent(database.sql);
  mediaDir = await mkdtemp(fileURLToPath(new URL("./.seo-media-", import.meta.url)));
  await sharp(fileURLToPath(new URL("../public/bory.png", import.meta.url)))
    .webp()
    .toFile(`${mediaDir}/0123456789abcdef-320.webp`);
  const variants = JSON.stringify([
    { file: "0123456789abcdef-320.webp", width: 320, height: 320, format: "webp" },
  ]);
  await database.sql`INSERT INTO content.media (ref_kind, role, source, hash, width, height, variants, alt, fetched_at, checked_at)
    VALUES ('screenshot', 'image', 'own', '0123456789abcdef', 320, 320, ${variants}::jsonb, 'Existing art fixture', 1, 1)`;
  await database.sql`UPDATE content.paths SET body = body || '{"hero":{"image":"0123456789abcdef","alt":"Existing art fixture"}}'::jsonb WHERE slug = 'forever-2'`;
  server = spawn(
    process.execPath,
    [fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        DATABASE_URL: database.url,
        NITRO_HOST: "127.0.0.1",
        NUXT_MEDIA_DIR: mediaDir,
        UNBORED_MEDIA_DIR: mediaDir,
        NITRO_PORT: "0",
        NUXT_APP_SECRET: "local-preview-only-not-a-production-secret",
        NUXT_PUBLIC_SITE_URL: "https://playunbored.com",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  origin = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Production preview did not start")), 20_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Production preview exited"));
    });
    server.once("error", reject);
    server.stdout!.on("data", (chunk) => {
      const url = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) {
        clearTimeout(timeout);
        resolve(url);
      }
    });
  });
}, 30_000);

afterAll(async () => {
  for (const window of windows) await window.happyDOM.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  await database?.drop();
  if (mediaDir) await rm(mediaDir, { recursive: true, force: true });
});

async function page(path: string) {
  const response = await fetch(origin + path);
  expect(response.status).toBe(200);
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      disableComputedStyleRendering: true,
    },
  });
  windows.push(window);
  window.document.write(await response.text());
  return window.document;
}

productionTest(
  "rendered graph links the Organization, Article dates and existing guide schemas",
  async () => {
    const document = await page("/guides/forever-1");
    const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
      (script) => JSON.parse(script.textContent!)["@graph"],
    );
    const node = (type: string) => nodes.find((value) => [value["@type"]].flat().includes(type));
    const organization = node("Organization");
    expect(organization).toMatchObject({
      name: "Unbored",
      url: "https://playunbored.com",
      sameAs: ["https://t.me/playunbored", "https://github.com/hmbanan666/wow-unbored"],
    });
    const logo = nodes.find((value) => value["@id"] === organization.logo["@id"]);
    expect(logo?.url || organization.logo.url).toBe("https://playunbored.com/bory.png");
    expect(node("Article")).toMatchObject({
      author: { "@id": organization["@id"] },
      publisher: { "@id": organization["@id"] },
      datePublished: "2026-11-05T08:00:00.000Z",
      dateModified: "2026-11-09T08:00:00.000Z",
      about: { "@type": "VideoGame", name: "World of Warcraft: Forever" },
    });
    expect(node("WebSite")).toBeDefined();
    expect(node("BreadcrumbList").itemListElement[1]).toMatchObject({
      name: "WoW Forever",
      item: "https://playunbored.com/forever",
    });
    expect(
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    ).toBe("2026-11-05T08:00:00.000Z");
    expect(
      document.querySelector('meta[property="article:modified_time"]')?.getAttribute("content"),
    ).toBe("2026-11-09T08:00:00.000Z");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://playunbored.com/guides/forever-1",
    );
  },
);

productionTest(
  "SSR navigation follows the Game and guide endings link to three published siblings",
  async () => {
    for (const game of ["forever", "retail"]) {
      const document = await page(`/guides/${game}-1`);
      const hub = game === "forever" ? "/forever" : "/guides";
      expect(
        [...document.querySelectorAll('header a[aria-current="page"]')].map((link) =>
          link.getAttribute("href"),
        ),
      ).toEqual([hub, hub]);
      const section = [...document.querySelectorAll("main section")].find(
        (section) =>
          section.querySelector("h2")?.textContent ===
          (game === "forever" ? "More WoW Forever guides" : "More guides"),
      );
      expect(section).toBeDefined();
      expect(section!.querySelector(`a[href="${hub}"]`)).not.toBeNull();
      const siblings = [...section!.querySelectorAll('a[href^="/guides/"]')].map((link) =>
        link.getAttribute("href"),
      );
      expect(siblings).toHaveLength(3);
      for (const href of siblings) {
        expect(href).toMatch(new RegExp(`^/guides/${game}-[2-5]$`));
        expect((await fetch(origin + href)).status).toBe(200);
      }
    }
  },
);

productionTest(
  "trailing slashes redirect permanently without changing queries or redirecting root",
  async () => {
    for (const path of ["/guides/forever-1/", "/about/", "/install///"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(origin + path + "?ref=a%2Fb&x=1&x=2", {
          redirect: "manual",
          method,
        });
        expect(response.status).toBe(301);
        expect(response.headers.get("location")).toBe(
          path.replace(/\/+$/, "") + "?ref=a%2Fb&x=1&x=2",
        );
      }
    }
    expect((await fetch(origin + "/?ref=home", { redirect: "manual" })).status).toBe(200);
  },
);

productionTest(
  "home metadata describes the project once, and About is linked and indexed",
  async () => {
    const home = await page("/");
    expect(home.title.length).toBeLessThanOrEqual(60);
    expect(home.title.match(/Unbored/g)).toHaveLength(1);
    expect(home.title).toContain("WoW Forever guides");
    expect(home.title).toContain("Retail addon plans");
    const description = home.querySelector('meta[name="description"]')!.getAttribute("content")!;
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(155);
    const about = await page("/about");
    expect(about.querySelectorAll("h1")).toHaveLength(1);
    expect(about.body.textContent).toContain("There are no paid placements.");
    expect(about.body.textContent).toContain("after patches and when sources change");
    expect(home.querySelector('footer a[href="/about"]')).not.toBeNull();
    expect(home.querySelector('footer a[href="https://t.me/playunbored"]')).not.toBeNull();
    const sitemap = await fetch(origin + "/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(await sitemap.text()).toContain("https://playunbored.com/about");
    for (const [path, type] of [
      ["/", "SoftwareApplication"],
      ["/install", "SoftwareApplication"],
      ["/collections/first-mounts", "ItemList"],
    ]) {
      const document = await page(path!);
      expect(
        [...document.querySelectorAll('script[type="application/ld+json"]')].some((script) =>
          script.textContent!.includes(`"${type}"`),
        ),
      ).toBe(true);
      expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
        "summary_large_image",
      );
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
      expect(og).toBeTruthy();
      const image = await fetch(origin + new URL(og!).pathname);
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toContain("image/png");
      expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    }
  },
  30_000,
);

productionTest("a stored WebP hero stays visible in the rendered share PNG", async () => {
  const original = await fetch(origin + "/media/0123456789abcdef-320.webp");
  expect(original.headers.get("content-type")).toBe("image/webp");
  const source = await sharp(Buffer.from(await original.arrayBuffer()))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const converted = await fetch(origin + "/media/0123456789abcdef-320.webp?format=png");
  expect(converted.headers.get("content-type")).toBe("image/png");
  expect(converted.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  const pixels = await sharp(Buffer.from(await converted.arrayBuffer()))
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(pixels.info).toEqual(source.info);
  expect(pixels.data.equals(source.data)).toBe(true);
  const missing = await fetch(origin + "/media/ffffffffffffffff-320.webp?format=png");
  expect(missing.status).toBe(404);
  const document = await page("/guides/forever-2");
  const url = document.querySelector('meta[property="og:image"]')!.getAttribute("content")!;
  const response = await fetch(origin + new URL(url).pathname);
  expect(response.status).toBe(200);
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .raw()
    .toBuffer({ resolveWithObject: true });
  // The right-hand frame must contain the fixture's ginger pixels, not just the lamp background.
  let visible = 0;
  for (let y = 180; y < 480; y++) {
    for (let x = 850; x < 1100; x++) {
      if (data[(y * info.width + x) * info.channels]! > 80) visible++;
    }
  }
  expect(visible).toBeGreaterThan(10_000);
});
