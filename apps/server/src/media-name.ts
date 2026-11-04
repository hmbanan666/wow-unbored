import type { MediaRequest } from "@unbored/contracts/game-media";
import type { GameDb } from "./game-db.ts";
import { ENTITY_TABLES } from "./game-tools.ts";

/** Inline art uses the current English game name when the page has no named item. */
export async function mediaName(game: GameDb, ref: MediaRequest): Promise<string | undefined> {
  if (ref.kind === "pet") return undefined; // The species API supplies its name.
  const table = ref.kind === "toy" ? "ItemSparse" : ENTITY_TABLES[ref.kind];
  const id = ref.kind === "toy" ? Number((await game.row("Toy", ref.id))?.fields.ItemID) : ref.id;
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  const row = await game.row(table, id);
  const name = row?.fields.Display_lang ?? row?.fields.Name_lang ?? row?.fields.Title_lang;
  return typeof name === "string" ? name : undefined;
}
