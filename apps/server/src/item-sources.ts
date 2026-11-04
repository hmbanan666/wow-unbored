import type { BlizzardIds } from "./blizzard.ts";
import { loadCatalog } from "./suggestions.ts";

/** Keep evidence separate: a journal entry or a boss name does not prove a guaranteed drop. */
export async function getItemSources(itemID: number, locale: "enUS" | "ruRU", api?: BlizzardIds) {
  const journal = await api?.itemSources(itemID, locale);
  const catalog = loadCatalog().farm.flatMap((row) =>
    Object.values(row.mountSources).flatMap((source) => {
      if (source.itemID !== itemID || !source.source || !/^https:\/\//.test(source.source))
        return [];
      return [
        {
          itemID,
          ...("boss" in source
            ? {
                boss: source.boss,
                difficulty: source.difficulty ?? null,
                condition: source.condition ?? null,
              }
            : { achievementID: source.achievementID }),
          guaranteed: null,
          source: { kind: "Catalog", row: row.id, url: source.source, locale: "enUS" },
        },
      ];
    }),
  );
  return {
    itemID,
    sources: [...(journal?.sources ?? []), ...catalog],
    coverage: {
      blizzard: journal ? (journal.truncated ? "truncated" : "available") : "unavailable",
      catalog: catalog.length ? "matched" : "no sourced item row",
    },
    unavailable: [
      "drop probability and acquisition guarantee",
      "exhaustive vendor, quest and crafting sources",
      ...(!journal ? ["Blizzard Game Data API unavailable"] : []),
      ...(journal?.truncated ? ["journal search: result limit"] : []),
    ],
  };
}
