import { z } from "zod";
import { ContentStore } from "./content.ts";
import type { DataStore } from "./data.ts";
import type { Db } from "./db.ts";
import type { GameDb } from "./game-db.ts";
import { createPathProgressReader } from "./path-progress.ts";
import { accountKey } from "./store.ts";

export const pathSelectionSchema = z
  .object({
    kind: z.enum(["path", "collection"]),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    locale: z.enum(["en", "ru"]),
  })
  .strict();
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
      (row) => row.name === who.character && row.realm === who.realm,
    );
    if (!character) throw new ActivePathError("No game data for that Character on this Account.");
    return character;
  }

  async get(who: Character) {
    if (!this.db.pg) throw new ActivePathError("Active Paths need Postgres.");
    return this.db.tx(async () => {
      await this.db.lockKey(`account:${accountKey(who.account)}`);
      const character = await this.character(who);
      const selected = await this.db.get<Selection>(
        "SELECT kind, slug, locale FROM active_paths WHERE character_id = ?",
        character.id,
      );
      if (!selected) return { ...who, path: null };
      const path = (await new ContentStore(this.db, this.game).publishedPaths()).find(
        (path) =>
          path.kind === selected.kind &&
          path.slug === selected.slug &&
          path.locale === selected.locale,
      );
      if (!path) return { ...who, path: null };
      const [progress] = await createPathProgressReader(this.game)(
        [path],
        await this.data.sectionsFor(character),
      );
      return { ...who, path: progress! };
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
