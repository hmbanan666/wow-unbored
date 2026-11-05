import { pageMediaRefs, type MediaRequest, type MediaVariant } from "@unbored/contracts/game-media";
import type { Db } from "./db.ts";
import { MediaMissing, MediaResolver, downloadMedia, type MediaRole } from "./media.ts";
import { collectMediaFiles, convertMedia, mediaDirectory, MEDIA_PIPELINE } from "./media-files.ts";

type PageBody = Parameters<typeof pageMediaRefs>[0];
type AssetRow = {
  id: number;
  ref_kind: MediaRequest["kind"];
  ref_id: number;
  role: MediaRole;
  source_url: string;
  hash: string;
  width: number;
  height: number;
  variants: MediaVariant[];
  name: string;
  overrides: MediaRequest["media"];
  fetched_at: number;
  checked_at: number;
  pipeline_version: number | null;
};
const DAY = 86_400;
const LABEL = {
  mount: "mount",
  pet: "battle pet",
  achievement: "achievement",
  item: "item",
  toy: "toy",
  currency: "currency",
  instance: "instance",
};

/** Single-process, bounded background work; publishing only enqueues an identity. */
export class MediaStore {
  private db: Db;
  private resolver: MediaResolver | null;
  private directory: string;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private log: (line: string) => void;
  private names?: (ref: MediaRequest) => Promise<string | undefined>;
  private pending = new Map<string, { kind: string; slug: string; locale: string }>();
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(
    db: Db,
    resolver: MediaResolver | null,
    directory = mediaDirectory(),
    fetchImpl: typeof fetch = fetch,
    now = () => Math.floor(Date.now() / 1000),
    log: (line: string) => void = () => {},
    names?: (ref: MediaRequest) => Promise<string | undefined>,
  ) {
    this.db = db;
    this.resolver = resolver;
    this.directory = directory;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.log = log;
    this.names = names;
  }
  enqueue(page: { kind: string; slug: string; locale: string }) {
    if (!this.db.pg || !this.resolver || this.stopped) return;
    if (this.pending.size >= 256) {
      this.log("Media: publish queue full; run media sync to retry.");
      return;
    }
    this.pending.set(`${page.kind}:${page.slug}:${page.locale}`, page);
    setImmediate(() => void this.drain());
  }
  private drain(): Promise<void> {
    this.running ??= (async () => {
      while (this.pending.size && !this.stopped) {
        const [key, page] = this.pending.entries().next().value!;
        this.pending.delete(key);
        try {
          const row = await this.db.get<{ body: PageBody }>(
            "SELECT body FROM content.paths WHERE game = 'retail' AND kind = ? AND slug = ? AND locale = ? AND status = 'published'",
            page.kind,
            page.slug,
            page.locale,
          );
          if (row) await this.syncPage(row.body);
        } catch {
          this.log("Media: page sync failed; run media sync to retry.");
        }
      }
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  start() {
    if (!this.db.pg || !this.resolver || this.timer) return;
    const tick = () => {
      if (this.running || this.stopped) return;
      this.running = this.refresh()
        .catch(() => {
          this.log("Media: refresh failed; retrying next day.");
        })
        .finally(() => {
          this.running = undefined;
          void this.drain();
        });
    };
    this.timer = setInterval(tick, DAY * 1000);
    this.timer.unref();
    tick();
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }

  async syncPublished(slug?: string) {
    const pages = await this.db.all<{ body: PageBody }>(
      "SELECT body FROM content.paths WHERE game = 'retail' AND status = 'published' AND (CAST(? AS text) IS NULL OR slug = ?)",
      slug ?? null,
      slug ?? null,
    );
    for (const page of pages) await this.syncPage(page.body);
    if (!slug || slug === "home")
      for (const page of await this.db.all<{ body: PageBody }>("SELECT body FROM web.pages"))
        await this.syncPage(page.body);
    if (!slug) await this.refresh();
  }
  async syncPage(body: PageBody) {
    for (const ref of pageMediaRefs(body).refs) {
      try {
        await this.syncRef(ref);
      } catch {
        this.log("Media: reference sync failed; existing art retained.");
      }
    }
  }
  private async syncRef(ref: MediaRequest, refresh = false) {
    if (!this.resolver) return;
    ref = { ...ref, name: ref.name || (await this.names?.(ref)) };
    const sources = await this.resolver.resolve(ref);
    for (const asset of sources) {
      const existing = await this.db.get<AssetRow>(
        "SELECT * FROM content.media WHERE source = 'blizzard' AND ref_kind = ? AND ref_id = ? AND role = ?",
        ref.kind,
        ref.id,
        asset.role,
      );
      if (
        !refresh &&
        existing &&
        existing.pipeline_version === MEDIA_PIPELINE &&
        existing.checked_at > this.now() - 25 * DAY &&
        existing.source_url === asset.url &&
        existing.name === asset.name &&
        JSON.stringify(existing.overrides) === JSON.stringify(ref.media ?? {})
      )
        continue;
      // Reuse a fresh conversion of the same source, including another reference's icon.
      const cached = await this.db.get<AssetRow>(
        "SELECT * FROM content.media WHERE source = 'blizzard' AND source_url = ? AND role = ? AND pipeline_version = ? AND fetched_at > ? LIMIT 1",
        asset.url,
        asset.role,
        MEDIA_PIPELINE,
        this.now() - 25 * DAY,
      );
      let converted;
      try {
        converted =
          cached ??
          (await convertMedia(
            await downloadMedia(asset.url, this.fetchImpl),
            asset.role,
            this.directory,
          ));
      } catch (error) {
        if (error instanceof MediaMissing) {
          await this.db.run(
            "DELETE FROM content.media WHERE source = 'blizzard' AND ref_kind = ? AND ref_id = ? AND role = ?",
            ref.kind,
            ref.id,
            asset.role,
          );
          continue;
        }
        throw error;
      }
      const label = LABEL[ref.kind];
      const alt = asset.name
        ? `${asset.name}, a World of Warcraft ${label}`
        : `World of Warcraft ${label}`;
      await this.db.run(
        `INSERT INTO content.media (ref_kind, ref_id, role, source, source_url, hash, width, height, variants, name, alt, overrides, fetched_at, checked_at, pipeline_version)
        VALUES (?, ?, ?, 'blizzard', ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, CAST(? AS jsonb), ?, ?, ?)
        ON CONFLICT (ref_kind, ref_id, role) WHERE source = 'blizzard' DO UPDATE SET source_url = excluded.source_url, hash = excluded.hash,
        width = excluded.width, height = excluded.height, variants = excluded.variants, name = excluded.name, alt = excluded.alt,
        overrides = excluded.overrides, fetched_at = excluded.fetched_at, checked_at = excluded.checked_at,
        pipeline_version = excluded.pipeline_version`,
        ref.kind,
        ref.id,
        asset.role,
        asset.url,
        converted.hash,
        converted.width,
        converted.height,
        JSON.stringify(converted.variants),
        asset.name,
        alt,
        JSON.stringify(ref.media ?? {}),
        cached?.fetched_at ?? this.now(),
        this.now(),
        MEDIA_PIPELINE,
      );
    }
    if (refresh) {
      for (const row of await this.db.all<AssetRow>(
        "SELECT * FROM content.media WHERE source = 'blizzard' AND ref_kind = ? AND ref_id = ?",
        ref.kind,
        ref.id,
      )) {
        if (!sources.some((source) => source.role === row.role))
          await this.db.run("DELETE FROM content.media WHERE id = ?", row.id);
      }
    }
  }
  async refresh() {
    if (!this.resolver) return;
    let after = 0;
    while (!this.stopped) {
      const rows = await this.db.all<AssetRow>(
        "SELECT * FROM content.media WHERE source = 'blizzard' AND (checked_at < ? OR fetched_at < ? OR pipeline_version IS DISTINCT FROM ?) AND id > ? ORDER BY id LIMIT 20",
        this.now() - 25 * DAY,
        this.now() - 25 * DAY,
        MEDIA_PIPELINE,
        after,
      );
      if (!rows.length) break;
      const seen = new Set<string>();
      for (const row of rows) {
        after = row.id;
        const key = `${row.ref_kind}:${row.ref_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await this.syncRef(
            { kind: row.ref_kind, id: row.ref_id, name: row.name, media: row.overrides },
            true,
          );
        } catch (error) {
          if (error instanceof MediaMissing)
            await this.db.run(
              "DELETE FROM content.media WHERE source = 'blizzard' AND ref_kind = ? AND ref_id = ?",
              row.ref_kind,
              row.ref_id,
            );
          else this.log("Media: asset refresh failed; retrying next day.");
        }
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // An outage cannot extend the API's maximum retention period.
    await this.db.run(
      "DELETE FROM content.media WHERE source = 'blizzard' AND fetched_at < ?",
      this.now() - 30 * DAY,
    );
  }
  async addImage(bytes: Buffer, refKind: string, alt: string) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(refKind) || !alt.trim() || alt.length > 500)
      throw new Error("An image needs a ref-kind and alt text");
    const asset = await convertMedia(bytes, "image", this.directory);
    await this.db.run(
      `INSERT INTO content.media (ref_kind, role, source, hash, width, height, variants, alt, fetched_at, checked_at, pipeline_version)
      VALUES (?, 'image', 'own', ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?)
      ON CONFLICT (hash, role) WHERE source = 'own' DO UPDATE SET alt = excluded.alt, ref_kind = excluded.ref_kind`,
      refKind,
      asset.hash,
      asset.width,
      asset.height,
      JSON.stringify(asset.variants),
      alt.trim(),
      this.now(),
      this.now(),
      MEDIA_PIPELINE,
    );
    return asset.hash;
  }
  async gc() {
    const rows = await this.db.all<{ variants: MediaVariant[] }>(
      "SELECT variants FROM content.media",
    );
    return collectMediaFiles(
      this.directory,
      new Set(rows.flatMap((row) => row.variants.map((v) => v.file))),
    );
  }
}
