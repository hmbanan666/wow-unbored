import type { CharacterIdentity } from "./character-page";
import { isGame } from "./public-professions";
export type PickerCharacter = CharacterIdentity & { level: number | null; class: string | null };
export const CHARACTER_COOKIE = "unbored_character";
export const CHARACTER_COOKIE_AGE = 365 * 24 * 60 * 60;
export function characterKey(c: CharacterIdentity): string {
  return `${c.game}/${encodeURIComponent(c.realm)}/${encodeURIComponent(c.name)}`;
}
export function parseCharacter(value: unknown): CharacterIdentity | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  const parts = value.split("/");
  if (parts.length !== 3 || !isGame(parts[0])) return null;
  try {
    const realm = decodeURIComponent(parts[1]!);
    const name = decodeURIComponent(parts[2]!);
    // Reject cookie control bytes before they can become a character identity.
    // eslint-disable-next-line no-control-regex
    if (!realm.trim() || !name.trim() || /[\x00-\x1f\x7f]/.test(realm + name)) return null;
    return { game: parts[0], realm, name };
  } catch {
    return null;
  }
}
