import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { MEDIA_FILE, type MediaVariant } from "@unbored/contracts/game-media";
import type { MediaRole } from "./media.ts";

sharp.concurrency(1);
export const mediaDirectory = () => process.env.UNBORED_MEDIA_DIR || "/srv/media";

// Bump whenever conversion changes: immutable URLs must never serve a different image.
export const MEDIA_PIPELINE = 2;
export function mediaHash(bytes: Buffer, pipeline = MEDIA_PIPELINE) {
  return createHash("sha256").update(`${pipeline}:`).update(bytes).digest("hex").slice(0, 16);
}

export async function convertMedia(bytes: Buffer, role: MediaRole, directory: string) {
  const hash = mediaHash(bytes);
  // Raw pixels discard EXIF orientation too: AVIF otherwise carries it into the output.
  const { data: pixels, info: metadata } = await sharp(bytes, {
    limitInputPixels: 40_000_000,
    animated: false,
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!metadata.width || !metadata.height || metadata.width < 10)
    throw new Error("Invalid media dimensions");
  const input = sharp(pixels, { raw: metadata });
  const targets = role === "icon" ? [56] : role === "tile" ? [300, 600] : [320, 640];
  const widths = [...new Set(targets.map((width) => Math.min(width, metadata.width)))];
  const variants: MediaVariant[] = [];
  await mkdir(directory, { recursive: true });
  for (const width of widths) {
    for (const format of ["avif", "webp"] as const) {
      const { data, info } = await input
        .clone()
        .resize({ width, withoutEnlargement: true })
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
