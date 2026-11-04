import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { MEDIA_FILE, type MediaVariant } from "@unbored/contracts/game-media";
import type { MediaRole } from "./media.ts";

sharp.concurrency(1);
export const mediaDirectory = () => process.env.UNBORED_MEDIA_DIR || "/srv/media";

export async function convertMedia(bytes: Buffer, role: MediaRole, directory: string) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const input = sharp(bytes, { limitInputPixels: 40_000_000, animated: false }).rotate();
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 10)
    throw new Error("Invalid media dimensions");
  const widths =
    role === "icon" ? [Math.min(56, metadata.width)] : role === "tile" ? [300, 600] : [320, 640];
  // The render's corner is the flat dark background; trimming leaves the subject's bounds.
  const prepared = role === "render" ? input.trim({ threshold: 15 }) : input;
  const variants: MediaVariant[] = [];
  await mkdir(directory, { recursive: true });
  for (const width of widths) {
    for (const format of ["avif", "webp"] as const) {
      const { data, info } = await prepared
        .clone()
        .resize({ width, withoutEnlargement: role === "icon" })
        .toFormat(format)
        .toBuffer({ resolveWithObject: true });
      const file = `${hash}-${info.width}.${format}`;
      if (!MEDIA_FILE.test(file)) throw new Error("Invalid media variant dimensions");
      const temporary = join(directory, `${file}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, data, { flag: "wx" });
        await rename(temporary, join(directory, file));
      } finally {
        await rm(temporary, { force: true });
      }
      variants.push({ file, width: info.width, height: info.height, format });
    }
  }
  const largest = variants.at(-1)!;
  return { hash, width: largest.width, height: largest.height, variants };
}

/** A one-day grace period protects files written before their row is committed. */
export async function collectMediaFiles(
  directory: string,
  referenced: Set<string>,
  now = Date.now(),
) {
  let removed = 0;
  await mkdir(directory, { recursive: true });
  for (const file of await readdir(directory)) {
    if (
      (!MEDIA_FILE.test(file) &&
        !/^[0-9a-f]{16}-\d{2,4}\.(avif|webp)\.[0-9a-f-]+\.tmp$/.test(file)) ||
      referenced.has(file)
    )
      continue;
    const path = join(directory, file);
    const info = await stat(path);
    if (info.isFile() && info.mtimeMs < now - 86_400_000) {
      await rm(path, { force: true });
      removed++;
    }
  }
  return removed;
}
