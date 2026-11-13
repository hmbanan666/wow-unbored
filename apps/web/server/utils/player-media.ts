import { join } from "node:path";
import type { Sql } from "./db";
import { serveMedia } from "./media-file";
export async function servePlayerMedia(sql: Sql, directory: string, id: string, file: string) {
  const missing = () =>
    new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  if (!/^[0-9a-f-]{36}$/.test(id)) return missing();
  const rows =
    await sql`SELECT 1 FROM character_screenshots p JOIN character_sharing s ON s.character_id = p.character_id JOIN characters c ON c.id = s.character_id WHERE s.enabled AND c.account_id = s.account_id AND p.account_id = c.account_id AND c.game = 'forever' AND p.id = ${id} AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.variants) v WHERE v->>'file' = ${file})`;
  if (!rows.length) return missing();
  const response = await serveMedia(file, join(directory, "players", id));
  response.headers.set("cache-control", "no-store");
  return response;
}
