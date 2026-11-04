import { loadCatalog } from "./suggestions.ts";
import type { GameDb } from "./game-db.ts";

/** Only an explicit sourced verdict establishes that a target is chance-only. */
export function catalogAcquisition(kind: string, id: number) {
  const sources = loadCatalog().farm.flatMap((row) =>
    Object.entries(row.mountSources).flatMap(([mountID, source]) => {
      const matches =
        (kind === "mount" && Number(mountID) === id) || (kind === "item" && source.itemID === id);
      return matches && source.source?.startsWith("https://") && source.acquisition
        ? [{ acquisition: source.acquisition, source: source.source }]
        : [];
    }),
  );
  return {
    acquisition: sources.some((row) => row.acquisition === "guaranteed")
      ? "guaranteed"
      : sources.some((row) => row.acquisition === "chance-only")
        ? "chance-only"
        : "unknown",
    sources: sources.map((row) => row.source),
  };
}

export async function acquisition(
  kind: "mount" | "pet" | "toy" | "item",
  id: number,
  game: GameDb,
  build?: string,
) {
  const catalog = catalogAcquisition(kind, id);
  if (!build) return catalog;
  const table = kind === "mount" ? "Mount" : kind === "pet" ? "BattlePetSpecies" : "Toy";
  const rows =
    table === "Toy"
      ? await game.related(table, "ItemID", id, build)
      : [(await game.row(table, id, "enUS", build))?.fields];
  // DB2 categories are zero-based: Quest 1, Vendor 2, Achievement 5.
  // Drop 0 alone cannot distinguish a guaranteed drop from a chance drop.
  if (rows.some((row) => row && [1, 2, 5].includes(Number(row.SourceTypeEnum))))
    return {
      acquisition: "guaranteed",
      sources: [`https://wago.tools/db2/${table}/csv?build=${build}&locale=enUS`],
    };
  return catalog;
}
