import { expect, test, vi } from "vite-plus/test";
import { createSSRApp, ref } from "vue";
import { config } from "@vue/test-utils";
import { renderToString } from "@vue/server-renderer";
import Install from "../../app/pages/install.vue";

async function render(release: unknown) {
  vi.stubGlobal(
    "useFetch",
    vi.fn(async () => ({ data: ref(release) })),
  );
  vi.stubGlobal("defineSoftwareApp", (value: unknown) => value);
  const schema = vi.fn();
  vi.stubGlobal("useSchemaOrg", schema);
  const app = createSSRApp(Install);
  for (const [name, component] of Object.entries(config.global.components!))
    app.component(name, component);
  return { html: await renderToString(app), schema };
}

test("install SSR offers a Windows download, live version, visible FAQ and matching schema", async () => {
  const { html, schema } = await render({
    version: "v1.2.3",
    publishedAt: "2026-11-09T10:00:00Z",
    assets: {
      windows: {
        name: "Unbored.Companion_1.2.3_x64-setup.exe",
        size: 5121567,
        sha256: "a".repeat(64),
      },
    },
  });
  const document = new DOMParser().parseFromString(html, "text/html");
  expect(document.querySelector('a[href="/download/windows"]')?.textContent).toBe(
    "Download for Windows",
  );
  expect(document.body.textContent).toContain("Free · v1.2.3 · 5.12 MB · Windows 10/11 · Retail");
  expect(document.body.textContent).toContain("9 November 2026");
  expect(document.body.textContent).toContain("a".repeat(64));
  expect(document.querySelectorAll(".guide-faq dt")).toHaveLength(8);
  expect(document.body.textContent).toContain("Not yet, Retail only");
  expect(document.body.textContent).not.toContain("arrives with the next Companion update");
  expect(document.body.textContent).not.toContain("—");
  const graph = schema.mock.calls.flatMap((call) => call[0]);
  const software = graph.find((node) => node.downloadUrl);
  expect(software).toMatchObject({
    downloadUrl: "https://playunbored.com/download/windows",
    softwareVersion: "v1.2.3",
    fileSize: "5121567 bytes",
    operatingSystem: "Windows 10/11",
    offers: { price: 0 },
  });
  expect(software.screenshot).toMatch(/^https:\/\/playunbored\.com\/media\/.+\.webp$/);
  expect(software.aggregateRating).toBeUndefined();
  const faq = graph.find((node) => node["@type"] === "FAQPage");
  expect(
    faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => ({
      q: q.name,
      a: q.acceptedAnswer.text,
    })),
  ).toEqual(
    [...document.querySelectorAll(".guide-faq dt")].map((q) => ({
      q: q.textContent,
      a: q.nextElementSibling!.textContent,
    })),
  );
});

test("an unavailable release keeps the download and setup advice without invented numbers", async () => {
  const { html, schema } = await render(null);
  expect(html).toContain('href="/download/windows"');
  expect(html).toContain("Free · Windows 10/11 · Retail");
  expect(html).not.toContain("v0.13.0");
  expect(html).toContain("Release details are temporarily unavailable");
  const software = schema.mock.calls.flatMap((call) => call[0]).find((node) => node.downloadUrl);
  expect(software.softwareVersion).toBeUndefined();
  expect(software.fileSize).toBeUndefined();
});
