/** `{ "ids1", "<chunk>", ... }` (docs/contract/README.md#packed-id-sets). */
export type PackedIdSet = string[];

export const PACKED_TAG = "ids1";
/** The same with whole-number values after each id: `"<gap>:<value>:<value>"`. */
export const PACKED_VALUES_TAG = "idv1";
export const PACKED_CHUNK = 4000;

export function isPackedIdSet(value: unknown): value is PackedIdSet {
  return (
    Array.isArray(value) &&
    (value[0] === PACKED_TAG || value[0] === PACKED_VALUES_TAG) &&
    value.every((v) => typeof v === "string")
  );
}

/** Every row of a packed set: the id and, for `idv1`, its values. */
export function unpackRows(packed: unknown): { id: number; values: number[] }[] {
  if (!isPackedIdSet(packed)) return [];
  const out: { id: number; values: number[] }[] = [];
  let previous = 0;
  for (const chunk of packed.slice(1)) {
    for (const word of chunk.split(",")) {
      if (!word) continue;
      const [gapWord = "", ...rest] = word.split(":");
      const gap = Number.parseInt(gapWord, 36);
      if (!Number.isFinite(gap)) continue;
      previous += gap;
      out.push({ id: previous, values: rest.map((part) => Number.parseInt(part, 36)) });
    }
  }
  return out;
}

export function unpackIds(packed: unknown): number[] {
  return unpackRows(packed).map((row) => row.id);
}

/** `{ [id]: firstValue }` of an `idv1` set, such as item counts. */
export function unpackCounts(packed: unknown): Map<number, number> {
  return new Map(unpackRows(packed).map((row) => [row.id, row.values[0] ?? 0]));
}

export function packIds(ids: Iterable<number>): PackedIdSet {
  const list = [...new Set([...ids].filter((id) => Number.isInteger(id) && id >= 0))].sort(
    (a, b) => a - b,
  );
  const out: PackedIdSet = [PACKED_TAG];
  let chunk: string[] = [];
  let length = 0;
  let previous = 0;
  for (const id of list) {
    const word = (id - previous).toString(36);
    previous = id;
    let extra = word.length + (chunk.length > 0 ? 1 : 0);
    if (chunk.length > 0 && length + extra > PACKED_CHUNK) {
      out.push(chunk.join(","));
      chunk = [];
      length = 0;
      extra = word.length;
    }
    chunk.push(word);
    length += extra;
  }
  if (chunk.length > 0) out.push(chunk.join(","));
  return out;
}
