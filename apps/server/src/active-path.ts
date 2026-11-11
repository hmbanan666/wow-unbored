import { pathReferenceSchema } from "@unbored/contracts";
import { z } from "zod";
import { ContentStore } from "./content.ts";
import type { CharacterRow, DataStore } from "./data.ts";
import type { Db } from "./db.ts";
import type { GameDb } from "./game-db.ts";
import { createPathProgressReader } from "./path-progress.ts";
import { accountKey } from "./store.ts";

export const pathSelectionSchema = pathReferenceSchema.omit({ version: true });
export const pathCharacterSchema = z
  .object({
    account: z.string().trim().min(1).max(80),
    character: z.string().trim().min(1).max(80),
    realm: z.string().trim().min(1).max(80),
  })
  .strict();
export const setActivePathSchema = pathCharacterSchema.extend({
  path: pathSelectionSchema.nullable(),
});
export class ActivePathError extends Error {}

type Selection = z.infer<typeof pathSelectionSchema>;
type Character = z.infer<typeof pathCharacterSchema>;

/** One selection per Character; content and progress retain their existing owners. */
export class ActivePaths {
  private db: Db;
  private data: DataStore;
  private game: GameDb;
  constructor(db: Db, data: DataStore, game: GameDb) {
    this.db = db;
    this.data = data;
    this.game = game;
  }

  private async character(who: Character) {
    const character = (await this.data.characters(who.account)).find(
      (row) => row.game === "retail" && row.name === who.character && row.realm === who.realm,
    );
    if (!character) throw new ActivePathError("No game data for that Character on this Account.");
    return character;
  }

  async get(who: Character) {
    if (!this.db.pg) throw new ActivePathError("Active Paths need Postgres.");
    return this.db.tx(async () => {
      await this.db.lockKey(`account:${accountKey(who.account)}`);
      const character = await this.character(who);
      return { ...who, path: await this.forCharacter(character) };
    });
  }

  /** Delivery may still hold a Character row after Forget my data removed it. */
  async forCharacter(character: CharacterRow) {
    if (!this.db.pg || character.game !== "retail") return null;
    return this.db.tx(async () => {
      await this.db.lockKey(`account:${character.accountId}`);
      const selected = await this.db.get<Selection>(
        "SELECT kind, slug, locale FROM active_paths WHERE character_id = ?",
        character.id,
      );
      if (!selected) return null;
      const path = (await new ContentStore(this.db, this.game).publishedPaths()).find(
        (path) =>
          path.kind === selected.kind &&
          path.slug === selected.slug &&
          path.locale === selected.locale,
      );
      if (!path) return null;
      const [progress] = await createPathProgressReader(this.game)(
        [path],
        await this.data.sectionsFor(character),
      );
      const completed = await this.db.get<{ at: number }>(
        "SELECT at FROM path_completions WHERE character_id = ? AND content_id = ?",
        character.id,
        path.id,
      );
      return { ...progress!, completedAt: completed?.at ?? null };
    });
  }

  async set(input: z.infer<typeof setActivePathSchema>) {
    if (!this.db.pg) throw new ActivePathError("Active Paths need Postgres.");
    const { path: selected, ...who } = input;
    return this.db.tx(async () => {
      await this.db.lockKey(`account:${accountKey(who.account)}`);
      const character = await this.character(who);
      if (selected) {
        const found = (await new ContentStore(this.db, this.game).publishedPaths()).some(
          (path) =>
            path.kind === selected.kind &&
            path.slug === selected.slug &&
            path.locale === selected.locale,
        );
        if (!found) throw new ActivePathError("Choose a published Path or Collection.");
        await this.db.run(
          `INSERT INTO active_paths (character_id, kind, slug, locale) VALUES (?, ?, ?, ?)
           ON CONFLICT (character_id) DO UPDATE SET kind = excluded.kind, slug = excluded.slug, locale = excluded.locale`,
          character.id,
          selected.kind,
          selected.slug,
          selected.locale,
        );
      } else {
        await this.db.run("DELETE FROM active_paths WHERE character_id = ?", character.id);
      }
      return this.get(who);
    });
  }
}
