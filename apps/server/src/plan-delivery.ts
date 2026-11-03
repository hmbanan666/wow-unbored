import { encodeUnb1 } from "./plan.ts";
import type { StoredPlan } from "./store.ts";
import type { SectionRow } from "./data.ts";

/** Keep whole UTF-8 characters, counting the ellipsis within the byte budget. */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const suffix = maxBytes >= 3 ? "…" : "";
  const budget = maxBytes - Buffer.byteLength(suffix);
  let bytes = 0;
  let out = "";
  for (const char of text) {
    bytes += Buffer.byteLength(char);
    if (bytes > budget) break;
    out += char;
  }
  return out + suffix;
}

function supportsFullNotes(version: string | undefined): boolean {
  const parts =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version ?? "",
    );
  if (!parts) return false;
  const [major, minor, patch] = parts.slice(1, 4).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  return major > 0 || minor > 11 || (minor === 11 && (patch > 0 || !parts[4]));
}

/** Adapt a delivery copy; the original Plan remains available after an upgrade. */
export async function planForAddon(
  stored: StoredPlan,
  version: string | undefined,
  latestCurrencies: () => Promise<Pick<SectionRow, "v" | "body"> | undefined>,
): Promise<string> {
  if (!stored.plan.tasks.some((task) => task.note && Buffer.byteLength(task.note) > 400)) {
    return stored.unb1;
  }
  if (version !== undefined) {
    if (supportsFullNotes(version)) return stored.unb1;
  } else {
    const section = await latestCurrencies();
    // 0.11 added currency row names; an empty or unfamiliar shape proves nothing.
    const rows = section?.body.list;
    const older =
      section?.v === 1 &&
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every((row: unknown) => {
        if (!row || typeof row !== "object") return false;
        const currency = row as Record<string, unknown>;
        return (
          Number.isInteger(currency.id) &&
          Number(currency.id) > 0 &&
          typeof currency.quantity === "number" &&
          Number.isFinite(currency.quantity) &&
          currency.quantity >= 0 &&
          !("name" in currency)
        );
      });
    if (!older) return stored.unb1;
  }
  return encodeUnb1({
    ...stored.plan,
    tasks: stored.plan.tasks.map((task) =>
      task.note === undefined ? task : { ...task, note: truncateUtf8(task.note, 400) },
    ),
  });
}
