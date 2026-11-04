import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { MEDIA_FILE } from "@unbored/contracts/game-media";

/** Open before streaming so missing files receive the same short-lived 404 as bad names. */
export async function serveMedia(file: string, directory: string): Promise<Response> {
  const missing = () =>
    new Response(null, { status: 404, headers: { "cache-control": "public, max-age=60" } });
  if (!MEDIA_FILE.test(file)) return missing();
  try {
    const handle = await open(join(directory, file), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile()) {
      await handle.close();
      return missing();
    }
    return new Response(Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>, {
      headers: {
        "content-type": file.endsWith(".avif") ? "image/avif" : "image/webp",
        "content-length": String(info.size),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return missing();
  }
}
