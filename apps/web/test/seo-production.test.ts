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
  ({ server, origin } = await startWebServer());
}, 30_000);

async function startWebServer(unavailable = false) {
  const server = spawn(
    process.execPath,
    [
      "--import",
      fileURLToPath(new URL("./download-fetch-fixture.mjs", import.meta.url)),
      fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url)),
    ],
    {
      env: {
        ...process.env,
        UNBORED_RELEASE_FIXTURE: unavailable ? "unavailable" : "available",
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
  const origin = await new Promise<string>((resolve, reject) => {
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
  return { server, origin };
}

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

productionTest(
  "unusual path separators cannot turn a canonical redirect into an external one",
  async () => {
    for (const path of ["/%5cexample.com/", "/%2fexample.com/", "/%09%5cexample.com/"]) {
      const response = await fetch(origin + path, { redirect: "manual" });
      expect(response.headers.get("location")).toBeNull();
    }
  },
);

productionTest(
  "FAQPage mirrors visible answers word for word and is absent without a FAQ block",
  async () => {
    for (const game of ["forever", "retail"]) {
      const document = await page(`/guides/${game}-1`);
      const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
        (script) => JSON.parse(script.textContent!)["@graph"],
      );
      const faq = nodes.find((node) => [node["@type"]].flat().includes("FAQPage"));
      expect(faq).toBeDefined();
      const resolve = (value: Record<string, unknown>) =>
        nodes.find((node) => node["@id"] === value["@id"]) || value;
      const questions = faq.mainEntity.map(resolve);
      document.querySelectorAll('[role="tooltip"]').forEach((tooltip) => tooltip.remove());
      const visible = [...document.querySelectorAll(".guide-faq dt")].map((question) => ({
        q: question.textContent,
        a: question.nextElementSibling!.textContent,
      }));
      expect(
        questions.map((question: { name: string; acceptedAnswer: Record<string, unknown> }) => ({
          q: question.name,
          a: resolve(question.acceptedAnswer).text,
        })),
      ).toEqual(visible);
      expect(visible).toEqual([
        { q: "Where can I rest & prepare?", a: 'Use the camp. Bring "food" & water.' },
        { q: "Which road?", a: "Take the northern road." },
        { q: 'What does "&amp;" mean?', a: 'Read "&lt;camp&gt;" as text.' },
      ]);
      expect(document.querySelector("table caption")?.textContent).toBe("Starting choices & costs");
      const without = await page(`/guides/${game}-3`);
      expect(
        [...without.querySelectorAll('script[type="application/ld+json"]')].some((script) =>
          script.textContent!.includes('"FAQPage"'),
        ),
      ).toBe(false);
    }
  },
);

productionTest(
  "install SSR exposes the current download, complete FAQ and release schema",
  async () => {
    const document = await page("/install");
    expect(document.querySelector('main a[href="/download/windows"]')?.textContent).toBe(
      "Download for Windows",
    );
    expect(document.querySelector('header a[href="/install"]')?.textContent).toBe("Get Bory");
    expect(document.body.textContent).toContain("Free · v1.2.3 · 5.12 MB · Windows 10/11 · Retail");
    expect(document.body.textContent).toContain("9 November 2026");
    expect(document.body.textContent).toContain("a".repeat(64));
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.title.length).toBeLessThanOrEqual(60);
    const description = document
      .querySelector('meta[name="description"]')!
      .getAttribute("content")!;
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(155);
    const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
      (script) => JSON.parse(script.textContent!)["@graph"],
    );
    const node = (type: string) => nodes.find((value) => [value["@type"]].flat().includes(type));
    const resolve = (value: Record<string, unknown>) =>
      nodes.find((n) => n["@id"] === value["@id"]) || value;
    const software = node("SoftwareApplication");
    expect(software).toMatchObject({
      downloadUrl: "https://playunbored.com/download/windows",
      softwareVersion: "v1.2.3",
      fileSize: "5121567 bytes",
      operatingSystem: "Windows 10/11",
    });
    expect(software.aggregateRating).toBeUndefined();
    expect(resolve(software.offers)).toMatchObject({ price: 0, priceCurrency: "USD" });
    const screenshot =
      typeof software.screenshot === "string"
        ? software.screenshot
        : resolve(software.screenshot).url;
    expect(screenshot).toMatch(/^https:\/\/playunbored.com\/media\/.*\.webp$/);
    const image = await fetch(origin + new URL(screenshot).pathname);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/webp");
    expect(node("BreadcrumbList").itemListElement.at(-1)).toMatchObject({
      name: "Get Bory",
      item: "https://playunbored.com/install",
    });
    const questions = node("FAQPage").mainEntity.map(resolve);
    const visible = [...document.querySelectorAll(".guide-faq dt")].map((q) => ({
      q: q.textContent,
      a: q.nextElementSibling!.textContent,
    }));
    expect(visible).toHaveLength(8);
    expect(
      questions.map((q: { name: string; acceptedAnswer: Record<string, unknown> }) => ({
        q: q.name,
        a: resolve(q.acceptedAnswer).text,
      })),
    ).toEqual(visible);
  },
);

productionTest("My pages keep private robots headers after the robots module runs", async () => {
  for (const path of [
    "/my",
    "/my/",
    "/my/forever/Realm/Mine",
    "/my/retail/Realm/Mine?from=test",
    "/my/forever/Realm/Mine/history",
    "/my/forever/Realm/Mine/enchanting?f=missing",
    "/my/retail/Realm/Mine/tailoring",
    "/my/retail/Realm/Mine/history?types=level_up",
    "/api/me/characters/forever/Realm/Mine/history",
  ]) {
    const response = await fetch(origin + path, { redirect: "manual" });
    expect(response.status, path).toBe(path === "/my/" ? 301 : 200);
    expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control"), path).toBe("private, no-store");
  }
  const publicPage = await fetch(origin + "/forever");
  expect(publicPage.headers.get("x-robots-tag")).toMatch(/^index, follow(?:,|$)/);
});

productionTest(
  "download HTTP routes redirect to files, reject unknown names and stay out of search",
  async () => {
    for (const [path, asset] of [
      ["windows", "Unbored.Companion_1.2.3_x64-setup.exe"],
      ["addon", "Unbored-v1.2.3.zip"],
      ["windows-msi", "Unbored.Companion_1.2.3_x64_en-US.msi"],
    ]) {
      const response = await fetch(`${origin}/download/${path}`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://github.com/hmbanan666/wow-unbored/releases/download/v1.2.3/${asset}`,
      );
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect((await fetch(origin + "/download/latest.json", { redirect: "manual" })).status).toBe(
      404,
    );
    expect(await (await fetch(origin + "/sitemap.xml")).text()).not.toContain("/download/");
    expect(await (await fetch(origin + "/robots.txt")).text()).toContain("Disallow: /download/");
  },
);

productionTest(
  "Bory links appear on Retail guides and Collections but never on Forever pages",
  async () => {
    for (const path of ["/guides/retail-1", "/collections/first-mounts"]) {
      const document = await page(path);
      expect(document.querySelector('main a[href="/install"]')).not.toBeNull();
      expect(document.body.textContent).toContain("Track this in game with Bory");
    }
    for (const path of ["/forever", ...[1, 2, 3, 4, 5].map((i) => `/guides/forever-${i}`)]) {
      const document = await page(path);
      expect(document.querySelector('main a[href="/install"]')).toBeNull();
      expect(document.querySelector("main")!.textContent).not.toContain(
        "Track this in game with Bory",
      );
    }
  },
);

productionTest(
  "an unavailable release still renders install advice and redirects to the release page",
  async () => {
    const preview = await startWebServer(true);
    try {
      const response = await fetch(preview.origin + "/install");
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('href="/download/windows"');
      expect(html).toContain("Free · Windows 10/11 · Retail");
      expect(html).toContain("Release details are temporarily unavailable");
      expect(html).not.toContain('"softwareVersion"');
      expect(html).not.toContain("v1.2.3");
      const redirect = await fetch(preview.origin + "/download/windows", { redirect: "manual" });
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get("location")).toBe(
        "https://github.com/hmbanan666/wow-unbored/releases/latest",
      );
    } finally {
      const exited = once(preview.server, "exit");
      preview.server.kill();
      await exited;
    }
  },
);

productionTest(
  "Forever hub has one CollectionPage linked to its ordered guide list and breadcrumbs",
  async () => {
    const document = await page("/forever");
    const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
      (script) => JSON.parse(script.textContent!)["@graph"],
    );
    const node = (type: string) => nodes.find((value) => [value["@type"]].flat().includes(type));
    const list = node("ItemList");
    expect(node("CollectionPage").mainEntity).toEqual({ "@id": list["@id"] });
    expect(list.numberOfItems).toBe(5);
    const visible = [
      ...new Set(
        [...document.querySelectorAll('main a[href^="/guides/"]')].map(
          (a) => `https://playunbored.com${a.getAttribute("href")}`,
        ),
      ),
    ];
    expect(list.itemListElement.map((entry: { url: string }) => entry.url)).toEqual(visible);
    expect(list.itemListElement.map((entry: { position: number }) => entry.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      node("BreadcrumbList").itemListElement.map(
        (entry: { name: string; item?: string }) => entry.name,
      ),
    ).toEqual(["Home", "WoW Forever"]);
    expect(node("Organization").name).toBe("Unbored");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.title.length).toBeLessThanOrEqual(60);
    const description = document
      .querySelector('meta[name="description"]')!
      .getAttribute("content")!;
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(155);
  },
);

productionTest(
  "More Forever guides puts a matching group ahead of newer unrelated guides",
  async () => {
    const document = await page("/guides/forever-1");
    const section = [...document.querySelectorAll("main section")].find(
      (s) => s.querySelector("h2")?.textContent === "More WoW Forever guides",
    )!;
    const siblings = [...section.querySelectorAll('a[href^="/guides/"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(siblings).toEqual(["/guides/forever-5", "/guides/forever-2", "/guides/forever-3"]);
  },
);
