import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { randomUUID, createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Db } from "./db.ts";
import { convertMedia, mediaDirectory, mediaHash } from "./media-files.ts";
export type FeedIdentity = { realm: string; name: string };
export class FeedError extends HTTPException {
  constructor(status: number, message: string) {
    super(status as ContentfulStatusCode, {
      message,
      res: Response.json(
        { message },
        { status, headers: { "cache-control": "private, no-store" } },
      ),
    });
  }
}
const slug = (value: string) =>
  value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
export const playerMediaDirectory = (id: string) => join(mediaDirectory(), "players", id);
async function character(db: Db, account: string, who: FeedIdentity) {
  const row = await db.get<{ id: string }>(
    "SELECT id FROM characters WHERE account_id = ? AND game = 'forever' AND realm = ? AND name = ?",
    account,
    who.realm,
    who.name,
  );
  if (!row) throw new FeedError(404, "Character not found.");
  return row.id;
}
export async function sharingState(db: Db, account: string, who: FeedIdentity) {
  const id = await character(db, account, who);
  const row = await db.get<{
    enabled: boolean;
    enabled_at: number;
    generation: string;
    realm_slug: string;
    name_slug: string;
  }>("SELECT * FROM character_sharing WHERE character_id = ? AND account_id = ?", id, account);
  return {
    enabled: row?.enabled ?? false,
    enabledAt: row?.enabled_at ?? 0,
    generation: row?.generation ?? "",
    href: `/forever/players/${encodeURIComponent(row?.realm_slug ?? slug(who.realm))}/${encodeURIComponent(row?.name_slug ?? slug(who.name))}`,
  };
}
export async function setSharing(
  db: Db,
  account: string,
  who: FeedIdentity,
  enabled: boolean,
  now = Math.floor(Date.now() / 1000),
) {
  return db.tx(async () => {
    await db.lockKey(`account:${account}`);
    const id = await character(db, account, who);
    await db.lockKey("character-feed-slugs");
    // Preserve the original public address. A rare normalized-name collision gets a stable suffix.
    let name = slug(who.name);
    const collision = await db.get(
      "SELECT 1 FROM character_sharing WHERE realm_slug = ? AND name_slug = ? AND character_id <> ?",
      slug(who.realm),
      name,
      id,
    );
    if (collision) name += `-${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
    await db.run(
      `INSERT INTO character_sharing (character_id, account_id, realm_slug, name_slug, enabled, enabled_at, generation) VALUES (?, ?, ?, ?, (?::int = 1), ?, ?)
      ON CONFLICT (character_id) DO UPDATE SET enabled = EXCLUDED.enabled, account_id = EXCLUDED.account_id,
      enabled_at = CASE WHEN character_sharing.account_id = EXCLUDED.account_id AND character_sharing.enabled = EXCLUDED.enabled THEN character_sharing.enabled_at ELSE EXCLUDED.enabled_at END,
      generation = CASE WHEN character_sharing.account_id = EXCLUDED.account_id AND character_sharing.enabled = EXCLUDED.enabled THEN character_sharing.generation ELSE EXCLUDED.generation END`,
      id,
      account,
      slug(who.realm),
      name,
      enabled ? 1 : 0,
      now,
      randomUUID(),
    );
    return sharingState(db, account, who);
  });
}
export async function uploadScreenshot(
  db: Db,
  account: string,
  who: FeedIdentity,
  bytes: Buffer,
  generation: string,
  at = Math.floor(Date.now() / 1000),
) {
  return db.tx(async () => {
    await db.lockKey(`account:${account}`);
    const id = await character(db, account, who);
    const state = await sharingState(db, account, who);
    const now = Math.floor(Date.now() / 1000);
    if (!state.enabled || generation !== state.generation || at < state.enabledAt || at > now + 60)
      throw new FeedError(409, "Turn sharing on before adding a new screenshot.");
    if (bytes.length > 12 * 1024 * 1024)
      throw new FeedError(413, "Choose a screenshot under 12 MB.");
    const existing = await db.get<{ id: string }>(
      "SELECT id FROM character_screenshots WHERE character_id = ? AND account_id = ? AND hash = ?",
      id,
      account,
      mediaHash(bytes),
    );
    if (existing) return existing;
    const count = await db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM character_screenshots WHERE character_id = ?",
      id,
    );
    if (Number(count?.count) >= 500)
      throw new FeedError(409, "This character's screenshot album is full.");
    const screenshot = randomUUID();
    try {
      const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
      if (!["jpeg", "png", "webp"].includes(info.format ?? "") || (info.pages ?? 1) !== 1)
        throw new Error("Unsupported image");
      const media = await convertMedia(bytes, "image", playerMediaDirectory(screenshot));
      await db.run(
        "INSERT INTO character_screenshots (id, character_id, account_id, at, hash, width, height, variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)",
        screenshot,
        id,
        account,
        at,
        media.hash,
        media.width,
        media.height,
        JSON.stringify(media.variants),
      );
      return { id: screenshot };
    } catch (error) {
      await rm(playerMediaDirectory(screenshot), { recursive: true, force: true });
      if (error instanceof FeedError) throw error;
      throw new FeedError(400, "Choose a PNG, JPEG or WebP screenshot.");
    }
  });
}
/** Called under the Account lock before deleting the character rows. Failed I/O leaves a retryable erasure. */
export async function erasePlayerMedia(db: Db, account: string) {
  if (!db.pg) return;
  const rows = await db.all<{ id: string }>(
    "SELECT p.id FROM character_screenshots p JOIN characters c ON c.id = p.character_id WHERE p.account_id = ? OR c.account_id = ?",
    account,
    account,
  );
  for (const row of rows) await rm(playerMediaDirectory(row.id), { recursive: true, force: true });
}
