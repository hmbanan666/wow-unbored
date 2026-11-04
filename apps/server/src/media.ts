import type { BlizzardIds } from "./blizzard.ts";
import type { MediaRequest } from "@unbored/contracts/game-media";

export type MediaRole = "icon" | "render" | "tile" | "image";
export type MediaSource = { role: MediaRole; url: string; name: string };
export class MediaMissing extends Error {}

/** Validate before every request; redirects are disabled even between allowed hosts. */
export function mediaUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      url.hostname === "render.worldofwarcraft.com" ||
      url.hostname === "oauth.battle.net" ||
      /^[a-z0-9-]+\.api\.blizzard\.com$/.test(url.hostname)
    )
  ) {
    throw new Error("Media source is not allowed");
  }
  return url.toString();
}

/** Bounds both declared and streamed bytes, including JSON documents. */
export async function downloadMedia(
  url: string,
  fetchImpl: typeof fetch = fetch,
  headers: Record<string, string> = {},
  cap = 2 * 1024 * 1024,
): Promise<Buffer> {
  const response = await fetchImpl(mediaUrl(url), {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) throw new MediaMissing("Blizzard no longer serves this media");
  if (!response.ok || !response.body) throw new Error("Media download failed");
  const reader = response.body.getReader();
  try {
    if (Number(response.headers.get("content-length")) > cap)
      throw new Error("Media exceeds size limit");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > cap) throw new Error("Media exceeds size limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}

type Document = {
  name?: string;
  icon?: string;
  item?: { id: number; name?: string };
  creature?: { id: number };
  creature_displays?: { id: number }[];
  assets?: { key: string; value: string }[];
};
export class MediaResolver {
  private region: string;
  private auth: Pick<BlizzardIds, "accessToken">;
  private fetchImpl: typeof fetch;
  constructor(
    region: string,
    auth: Pick<BlizzardIds, "accessToken">,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.region = region;
    this.auth = auth;
    this.fetchImpl = fetchImpl;
    if (!/^(us|eu|kr|tw)$/.test(region)) throw new Error("Invalid Blizzard region");
  }
  private async document(path: string): Promise<Document> {
    const token = await this.auth.accessToken();
    if (!token) throw new Error("Blizzard credentials unavailable");
    const url = `https://${this.region}.api.blizzard.com/data/wow/${path}?namespace=static-${this.region}&locale=en_US`;
    return JSON.parse(
      (
        await downloadMedia(url, this.fetchImpl, { authorization: `Bearer ${token}` }, 256_000)
      ).toString(),
    );
  }
  async resolve(ref: MediaRequest): Promise<MediaSource[]> {
    const out: MediaSource[] = [];
    let name = ref.name ?? "";
    const add = (role: MediaRole, url: string | undefined) => {
      if (url) out.push({ role, url: mediaUrl(url), name });
    };
    const optionalDocument = async (path: string) => {
      try {
        return await this.document(path);
      } catch (error) {
        if (error instanceof MediaMissing) return undefined;
        throw error;
      }
    };
    const asset = async (path: string, key: string) =>
      (await optionalDocument(path))?.assets?.find((a) => a.key === key)?.value;
    if (ref.media?.icon)
      add(
        "icon",
        `https://render.worldofwarcraft.com/${this.region}/icons/56/${ref.media.icon}.jpg`,
      );
    if (ref.kind === "currency") return out;
    if (ref.kind === "mount" || ref.kind === "pet") {
      let display = ref.media?.display;
      if (!display || (ref.kind === "pet" && !ref.media?.icon)) {
        const doc = await this.document(`${ref.kind}/${ref.id}`);
        name ||= doc.name ?? "";
        if (ref.kind === "pet") {
          if (!ref.media?.icon) add("icon", doc.icon);
          if (!display && doc.creature?.id)
            display = (await optionalDocument(`creature/${doc.creature.id}`))
              ?.creature_displays?.[0]?.id;
        } else display ??= doc.creature_displays?.[0]?.id;
      }
      if (display) add("render", await asset(`media/creature-display/${display}`, "zoom"));
    } else if (ref.kind === "instance") {
      add("tile", await asset(`media/journal-instance/${ref.id}`, "tile"));
    } else if (!ref.media?.icon) {
      // Content stores a toy by its item id (like kind item), so both read the item's media.
      add(
        "icon",
        await asset(
          `media/${ref.kind === "achievement" ? "achievement" : "item"}/${ref.id}`,
          "icon",
        ),
      );
    }
    return out.map((a) => ({ ...a, name: name || a.name }));
  }
}
