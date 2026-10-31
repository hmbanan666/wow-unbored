// docs/adr/0048: where else an item is on the Account, for the tooltip line
// "Also: Grubbyman 40, Warband bank 200". The Companion writes it into
// Advice.lua; the addon skips this character's own place.

export const HOLDINGS_MAX_ITEMS = 3000;
export const HOLDINGS_MAX_BYTES = 60 * 1024;
export const HOLDINGS_MAX_PLACES = 50;
/** Places last seen longer ago than this are left out (D143). */
export const HOLDINGS_STALE_SECONDS = 60 * 24 * 3600;
export const WARBAND_PLACE = "warband";

export type HoldingsPlace = {
  /** "Name-Realm" for a Character, "warband" for the Warband bank. */
  key: string;
  seenAt: number;
  items: { id: number; count: number }[];
};

export type Holdings = {
  places: string[];
  /** itemID -> "1:40,3:2,w:200": 1-based place index (w = Warband bank) and count. */
  items: Record<string, string>;
};

/** Bytes one item takes in Advice.lua: `        [12345] = "1:40,w:2",\n`. */
function luaBytes(id: number, value: string): number {
  return 16 + String(id).length + value.length;
}

/**
 * Builds the index. Stale places go first; over the cap, items held in the
 * fewest places are cut first (D143, open risk 5).
 */
export function buildHoldings(input: HoldingsPlace[], now: number): Holdings {
  const fresh = input
    .filter((place) => now - place.seenAt <= HOLDINGS_STALE_SECONDS)
    .sort((a, b) => {
      if ((a.key === WARBAND_PLACE) !== (b.key === WARBAND_PLACE))
        return a.key === WARBAND_PLACE ? 1 : -1;
      return b.seenAt - a.seenAt || a.key.localeCompare(b.key);
    })
    .slice(0, HOLDINGS_MAX_PLACES);
  const places = fresh.map((place) => place.key);
  const byItem = new Map<number, { place: string; count: number }[]>();
  fresh.forEach((place, index) => {
    const tag = place.key === WARBAND_PLACE ? "w" : String(index + 1);
    const counts = new Map<number, number>();
    for (const item of place.items) {
      if (!Number.isInteger(item.id) || item.id <= 0 || !(item.count > 0)) continue;
      counts.set(item.id, (counts.get(item.id) ?? 0) + Math.floor(item.count));
    }
    for (const [id, count] of counts) {
      const list = byItem.get(id) ?? [];
      list.push({ place: tag, count });
      byItem.set(id, list);
    }
  });
  const rows = [...byItem.entries()].map(([id, list]) => {
    list.sort((a, b) => b.count - a.count);
    return {
      id,
      places: list.length,
      total: list.reduce((sum, entry) => sum + entry.count, 0),
      value: list.map((entry) => `${entry.place}:${entry.count}`).join(","),
    };
  });
  rows.sort((a, b) => b.places - a.places || b.total - a.total || a.id - b.id);
  const items: Record<string, string> = {};
  let bytes = places.reduce((sum, key) => sum + key.length + 8, 64);
  let kept = 0;
  for (const row of rows) {
    if (kept >= HOLDINGS_MAX_ITEMS) break;
    const size = luaBytes(row.id, row.value);
    if (bytes + size > HOLDINGS_MAX_BYTES) break;
    items[String(row.id)] = row.value;
    bytes += size;
    kept += 1;
  }
  return { places, items };
}
