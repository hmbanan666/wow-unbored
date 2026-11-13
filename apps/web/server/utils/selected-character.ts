import type { CharacterIdentity } from "#shared/character-page";
import type { PickerCharacter } from "#shared/selected-character";
import type { Sql } from "./db";
export async function readPickerCharacters(
  sql: Sql,
  accountId: string,
): Promise<PickerCharacter[]> {
  return sql<
    PickerCharacter[]
  >`SELECT game, realm, name, level, class FROM characters WHERE account_id = ${accountId} ORDER BY last_seen DESC, game, name, realm`;
}
export async function ownsCharacter(
  sql: Sql,
  accountId: string,
  c: CharacterIdentity,
): Promise<boolean> {
  const rows =
    await sql`SELECT 1 FROM characters WHERE account_id = ${accountId} AND game = ${c.game} AND realm = ${c.realm} AND name = ${c.name}`;
  return rows.length === 1;
}
