import { afterEach, expect, test, vi } from "vite-plus/test";
import { createDownloads } from "../server/utils/downloads.ts";

const release = {
  tag_name: "v1.2.3",
  published_at: "2026-11-09T10:00:00Z",
  draft: false,
  prerelease: false,
  assets: [
    ["Unbored.Companion_1.2.3_x64-setup.exe.sig", 452],
    ["Unbored.Companion_1.2.3_arm64-setup.exe", 6000000],
    ["Unbored.Companion_1.2.3_x64-setup.exe", 5121567],
    ["Unbored.Companion_1.2.3_x64_en-US.msi", 7479296],
    ["Unbored-v1.2.3.zip", 300556],
    ["latest.json", 2000],
  ].map(([name, size]) => ({
    name,
    size,
    digest: `sha256:${"a".repeat(64)}`,
    browser_download_url: `https://github.com/hmbanan666/wow-unbored/releases/download/v1.2.3/${name}`,
  })),
};
const fallback = "https://github.com/hmbanan666/wow-unbored/releases/latest";
afterEach(() => vi.useRealTimers());

test("download responses select the installer, MSI and addon without offering signatures", async () => {
  const fetch = vi.fn(async () => Response.json(release));
  const log = vi.fn();
  const downloads = createDownloads(fetch, log);
  for (const [name, asset] of [
    ["windows", "Unbored.Companion_1.2.3_x64-setup.exe"],
    ["windows-msi", "Unbored.Companion_1.2.3_x64_en-US.msi"],
    ["addon", "Unbored-v1.2.3.zip"],
  ]) {
    const response = await downloads.respond(
      name!,
      "https://playunbored.com/install?private=1#secret",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `https://github.com/hmbanan666/wow-unbored/releases/download/v1.2.3/${asset}`,
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(log.mock.calls.at(-1)![0])).toEqual({
      event: "download",
      time: expect.any(String),
      asset,
      version: "v1.2.3",
      referrer: "/install",
    });
  }
  expect(log).toHaveBeenCalledTimes(3);
  expect(await downloads.release()).toMatchObject({
    version: "v1.2.3",
    publishedAt: release.published_at,
    assets: { windows: { size: 5121567, sha256: "a".repeat(64) } },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("metadata and redirects share a ten-minute cache and coalesce simultaneous reads", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => Response.json(release));
  const downloads = createDownloads(fetch, vi.fn());
  await Promise.all([
    downloads.release(),
    downloads.respond("windows"),
    downloads.respond("addon"),
  ]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]).toEqual([
    "https://api.github.com/repos/hmbanan666/wow-unbored/releases/latest",
    {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Unbored-Website" },
      signal: expect.any(AbortSignal),
    },
  ]);
  await vi.advanceTimersByTimeAsync(599999);
  await downloads.release();
  expect(fetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  fetch.mockImplementationOnce(async () => Response.json({ ...release, tag_name: "v1.2.4" }));
  expect((await downloads.release())?.version).toBe("v1.2.4");
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(["unknown", "latest.json", "windows.sig", "toString", "__proto__", ""])(
  "unknown asset %s is a 404 without fetching or logging",
  async (name) => {
    const fetch = vi.fn();
    const log = vi.fn();
    const response = await createDownloads(fetch, log).respond(name);
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  },
);

test.each([
  () => new Response(null, { status: 403 }),
  () => new Response("invalid json"),
  () => Response.json({ ...release, draft: true }),
  () => Response.json({ ...release, prerelease: true }),
  () => Response.json({ assets: [] }),
  () => {
    throw new Error("Network failure");
  },
])("API errors redirect once, cache failure and hide stale release metadata", async (response) => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => Response.json(release));
  const log = vi.fn();
  const downloads = createDownloads(fetch, log);
  expect(await downloads.release()).not.toBeNull();
  await vi.advanceTimersByTimeAsync(600000);
  fetch.mockImplementation(async () => response());
  const redirect = await downloads.respond("windows");
  expect(redirect.headers.get("location")).toBe(fallback);
  expect(redirect.status).toBe(302);
  expect(await downloads.release()).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledOnce();
  expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
    asset: "windows",
    version: null,
    referrer: null,
  });
  await vi.advanceTimersByTimeAsync(600000);
  fetch.mockImplementation(async () => Response.json(release));
  expect(await downloads.release()).not.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("missing assets fall back while available assets and metadata still work", async () => {
  const downloads = createDownloads(
    async () =>
      Response.json({
        ...release,
        assets: release.assets.filter((a) => !String(a.name).endsWith("-setup.exe")),
      }),
    vi.fn(),
  );
  expect((await downloads.respond("windows")).headers.get("location")).toBe(fallback);
  expect((await downloads.release())?.assets.windows).toBeUndefined();
  expect((await downloads.respond("addon")).headers.get("location")).toContain(
    "Unbored-v1.2.3.zip",
  );
});

test("a slow API is aborted after three seconds and yields the release-page fallback", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    (_url: unknown, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () => reject(new Error("Aborted")));
      }),
  );
  const downloads = createDownloads(fetch, vi.fn());
  const response = downloads.respond("windows");
  await vi.advanceTimersByTimeAsync(3000);
  expect((await response).headers.get("location")).toBe(fallback);
  expect(await downloads.release()).toBeNull();
});

test.each([
  "https://elsewhere.test/install",
  "https://playunbored.com.evil.test/install",
  "https://playunbored.com/enter/private-link?secret=1",
  "https://playunbored.com/my?character=private",
  "https://private:secret@playunbored.com/install",
  "not a URL",
])("download logs discard private or external referrer %s", async (referrer) => {
  const log = vi.fn();
  await createDownloads(async () => Response.json(release), log).respond("addon", referrer);
  expect(JSON.parse(log.mock.calls[0]![0]).referrer).toBeNull();
});

test("invalid digest is omitted and an off-repository asset cannot redirect a player", async () => {
  const downloads = createDownloads(
    async () =>
      Response.json({
        ...release,
        assets: release.assets.map((asset) => ({
          ...asset,
          digest: "sha256:bad",
          browser_download_url: String(asset.name).endsWith(".zip")
            ? "https://elsewhere.test/addon.zip"
            : asset.browser_download_url,
        })),
      }),
    vi.fn(),
  );
  expect((await downloads.release())?.assets.windows?.sha256).toBeNull();
  expect((await downloads.respond("addon")).headers.get("location")).toBe(fallback);
});
