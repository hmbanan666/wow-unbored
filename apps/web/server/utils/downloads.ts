import { PUBLIC_ROUTES, RELEASES_URL } from "../../shared/catalog.ts";
import type { DownloadAsset, ReleaseDownloads } from "../../shared/downloads.ts";

const API = "https://api.github.com/repos/hmbanan666/wow-unbored/releases/latest";
const TTL = 10 * 60 * 1000;
const MATCH = {
  windows: /^Unbored\.Companion_[^/]+_x64-setup\.exe$/,
  "windows-msi": /^Unbored\.Companion_[^/]+_x64(?:_[a-z]{2}-[A-Z]{2})?\.msi$/,
  addon: /^Unbored-v[^/]+\.zip$/,
};
type AssetName = keyof typeof MATCH;

function parseRelease(value: unknown): ReleaseDownloads {
  if (!value || typeof value !== "object") throw new Error("Missing release");
  const data = value as Record<string, unknown>;
  if (
    data.draft !== false ||
    data.prerelease !== false ||
    typeof data.tag_name !== "string" ||
    !data.tag_name ||
    typeof data.published_at !== "string" ||
    !Number.isFinite(Date.parse(data.published_at)) ||
    !Array.isArray(data.assets)
  )
    throw new Error("Invalid release");
  const assets: ReleaseDownloads["assets"] = {};
  for (const value of data.assets) {
    if (!value || typeof value !== "object") continue;
    const asset = value as Record<string, unknown>;
    if (
      typeof asset.name !== "string" ||
      typeof asset.browser_download_url !== "string" ||
      typeof asset.size !== "number" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0
    )
      continue;
    const url = new URL(asset.browser_download_url);
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/hmbanan666/wow-unbored/releases/download/")
    )
      continue;
    for (const name of Object.keys(MATCH) as AssetName[]) {
      if (!MATCH[name].test(asset.name)) continue;
      assets[name] = {
        name: asset.name,
        url: url.href,
        size: asset.size,
        sha256:
          typeof asset.digest === "string" && /^sha256:[a-f0-9]{64}$/i.test(asset.digest)
            ? asset.digest.slice(7)
            : null,
      } satisfies DownloadAsset;
    }
  }
  return { version: data.tag_name, publishedAt: data.published_at, assets };
}

/** Only public site paths, never queries, fragments or personal sign-in links. */
function referringPath(referrer?: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.origin !== "https://playunbored.com" || url.username || url.password) return null;
    return PUBLIC_ROUTES.some(({ pattern }) =>
      new RegExp(`^${pattern.replace(":slug", "[a-z0-9]+(?:-[a-z0-9]+)*")}$`).test(url.pathname),
    )
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}

/** One cache per web process, shared by SSR metadata and all download routes. */
export function createDownloads(
  fetchRelease: typeof fetch = fetch,
  log: (line: string) => void = console.log,
) {
  let cached: ReleaseDownloads | null = null;
  let expires = 0;
  let pending: Promise<ReleaseDownloads | null> | undefined;

  async function release(): Promise<ReleaseDownloads | null> {
    if (Date.now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetchRelease(API, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "Unbored-Website" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Release unavailable");
        cached = parseRelease(await response.json());
      } catch {
        cached = null;
      } finally {
        clearTimeout(timeout);
        expires = Date.now() + TTL;
        pending = undefined;
      }
      return cached;
    })();
    return pending;
  }

  async function respond(name: string, referrer?: string): Promise<Response> {
    const headers = { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };
    if (!Object.hasOwn(MATCH, name)) return new Response(null, { status: 404, headers });
    const current = await release();
    const asset = current?.assets[name as AssetName];
    log(
      JSON.stringify({
        event: "download",
        time: new Date().toISOString(),
        asset: asset?.name ?? name,
        version: current?.version ?? null,
        referrer: referringPath(referrer),
      }),
    );
    return new Response(null, {
      status: 302,
      headers: { ...headers, location: asset?.url ?? RELEASES_URL },
    });
  }
  return { release, respond };
}

export const downloads = createDownloads();
