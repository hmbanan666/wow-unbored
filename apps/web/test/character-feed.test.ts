import { expect, test, beforeEach, afterEach } from "vite-plus/test";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db";
import { seedPublicProfessions, fixtureCharacter } from "./public-professions-fixture";
import {
  readCharacterFeed,
  readCommunityFeed,
  sharedFeedPaths,
} from "../server/utils/character-feed";
let database: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
  if (!hasPostgres) return;
  database = await testDatabase();
  await seedPublicProfessions(database.sql);
  const id = `forever/${fixtureCharacter.realm}/${fixtureCharacter.name}`;
  await database.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'level_up', 'level', 100, '24', '25')`;
});
afterEach(async () => {
  await database?.drop();
});
test.skipIf(!hasPostgres)(
  "default-off feeds expose only the public stub and stay out of community and sitemap",
  async () => {
    expect(await readCharacterFeed(database.sql, "realm", "mira")).toEqual({
      shared: false,
      posts: [],
      next: null,
    });
    expect((await readCommunityFeed(database.sql)).posts).toEqual([]);
    expect(await sharedFeedPaths(database.sql)).toEqual([]);
  },
);

test.skipIf(!hasPostgres)(
  "sharing publishes milestones and hides them immediately in all public reads",
  async () => {
    const { PostgresDb } = await import("../../server/src/db");
    const { setSharing } = await import("../../server/src/character-sharing");
    const { fixtureAccount, fixtureOtherAccount } = await import("./public-professions-fixture");
    const db = new PostgresDb(database.sql);
    await expect(setSharing(db, fixtureOtherAccount, fixtureCharacter, true)).rejects.toThrow(
      "Character not found",
    );
    const state = await setSharing(db, fixtureAccount, fixtureCharacter, true);
    const parts = state.href.split("/").map(decodeURIComponent);
    const read = () => readCharacterFeed(database.sql, parts[3]!, parts[4]!);
    expect((await read()).posts.map((p) => p.label)).toEqual(["Level 25"]);
    expect((await readCommunityFeed(database.sql)).posts.map((p) => p.label)).toEqual(["Level 25"]);
    expect(await sharedFeedPaths(database.sql)).toEqual([state.href]);
    const id = `forever/${fixtureCharacter.realm}/${fixtureCharacter.name}`;
    await database.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value, day) VALUES (${id}, 'forever', 'gold_close', 'gold', 101, NULL, '999999', 0), (${id}, 'forever', 'gear_change', '1', 102, '1', '99999', NULL)`;
    expect((await read()).posts).toHaveLength(1);
    for (let i = 0; i < 30; i++)
      await database.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'level_up', ${String(i)}, 200, '25', '26')`;
    const first = await read();
    const second = await readCharacterFeed(database.sql, parts[3]!, parts[4]!, first.next!);
    expect(first.posts).toHaveLength(24);
    expect(second.posts).toHaveLength(7);
    expect(new Set([...first.posts, ...second.posts].map((p) => p.id)).size).toBe(31);
    await setSharing(db, fixtureAccount, fixtureCharacter, false);
    expect(await read()).toEqual({ shared: false, posts: [], next: null });
    expect((await readCommunityFeed(database.sql)).posts).toEqual([]);
    expect(await sharedFeedPaths(database.sql)).toEqual([]);
  },
);

test.skipIf(!hasPostgres)(
  "uploads require current consent, media hides immediately, and Forget my data removes every variant",
  async () => {
    const { mkdtemp, rm, readdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const sharp = (await import("sharp")).default;
    const { PostgresDb } = await import("../../server/src/db");
    const { Store } = await import("../../server/src/store");
    const { setSharing, uploadScreenshot } = await import("../../server/src/character-sharing");
    const { servePlayerMedia } = await import("../server/utils/player-media");
    const { fixtureAccount, fixtureOtherAccount } = await import("./public-professions-fixture");
    const directory = await mkdtemp(join(import.meta.dirname, ".feed-"));
    const old = process.env.UNBORED_MEDIA_DIR;
    process.env.UNBORED_MEDIA_DIR = directory;
    const store = new Store(directory, { postgres: database.sql });
    const db = new PostgresDb(database.sql);
    const bytes = await sharp({
      create: { width: 640, height: 360, channels: 3, background: "#7a2230" },
    })
      .png()
      .toBuffer();
    try {
      await expect(
        uploadScreenshot(db, fixtureAccount, fixtureCharacter, bytes, ""),
      ).rejects.toThrow("Turn sharing on");
      let state = await setSharing(db, fixtureAccount, fixtureCharacter, true);
      await expect(
        uploadScreenshot(db, fixtureOtherAccount, fixtureCharacter, bytes, state.generation),
      ).rejects.toThrow("Character not found");
      await expect(
        uploadScreenshot(
          db,
          fixtureAccount,
          fixtureCharacter,
          bytes,
          state.generation,
          state.enabledAt - 1,
        ),
      ).rejects.toThrow("Turn sharing on");
      const post = await uploadScreenshot(
        db,
        fixtureAccount,
        fixtureCharacter,
        bytes,
        state.generation,
      );
      expect(
        await uploadScreenshot(db, fixtureAccount, fixtureCharacter, bytes, state.generation),
      ).toEqual(post);
      const files = await readdir(join(directory, "players", post.id));
      expect(files).toHaveLength(4);
      const response = await servePlayerMedia(database.sql, directory, post.id, files[0]!);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await response.arrayBuffer();
      expect((await readCommunityFeed(database.sql)).posts[0]?.kind).toBe("screenshot");
      await setSharing(db, fixtureAccount, fixtureCharacter, false);
      expect((await servePlayerMedia(database.sql, directory, post.id, files[0]!)).status).toBe(
        404,
      );
      const previous = state.generation;
      state = await setSharing(db, fixtureAccount, fixtureCharacter, true);
      expect(state.generation).not.toBe(previous);
      await expect(
        uploadScreenshot(db, fixtureAccount, fixtureCharacter, bytes, previous),
      ).rejects.toThrow("Turn sharing on");
      await store.deleteAccountData(fixtureAccount);
      expect(await readdir(join(directory, "players"))).toEqual([]);
      expect((await readCommunityFeed(database.sql)).posts).toEqual([]);
      expect(await sharedFeedPaths(database.sql)).toEqual([]);
      expect((await servePlayerMedia(database.sql, directory, post.id, files[0]!)).status).toBe(
        404,
      );
    } finally {
      store.close();
      if (old === undefined) delete process.env.UNBORED_MEDIA_DIR;
      else process.env.UNBORED_MEDIA_DIR = old;
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test.skipIf(!hasPostgres)(
  "the restricted web role reads shared feeds and cannot write preferences or screenshots",
  async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = database.sql;
    await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN CREATE ROLE unbored_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END $$`;
    // Reapply exactly the migration's conditional grants even if the template predates the role.
    const migration = await readFile(
      new URL("../../server/migrations/0037_character_feeds.sql", import.meta.url),
      "utf8",
    );
    await sql.unsafe(migration.slice(migration.indexOf("DO $$")));
    await sql`GRANT SELECT ON characters, character_events TO unbored_web`;
    await sql`GRANT USAGE ON SCHEMA game TO unbored_web`;
    await sql`GRANT SELECT ON game.builds, game.profession_recipes, game.rows TO unbored_web`;
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE unbored_web`;
      expect((await readCommunityFeed(tx as never)).posts).toEqual([]);
      expect(await sharedFeedPaths(tx as never)).toEqual([]);
      expect(
        (
          await tx`SELECT has_table_privilege(current_user, 'character_sharing', 'INSERT') AS allowed`
        )[0]?.allowed,
      ).toBe(false);
      expect(
        (
          await tx`SELECT has_table_privilege(current_user, 'character_screenshots', 'DELETE') AS allowed`
        )[0]?.allowed,
      ).toBe(false);
    });
  },
);

test.skipIf(!hasPostgres)(
  "a new owner never inherits public consent or old milestones",
  async () => {
    const { PostgresDb } = await import("../../server/src/db");
    const { setSharing, sharingState } = await import("../../server/src/character-sharing");
    const { fixtureAccount, fixtureOtherAccount } = await import("./public-professions-fixture");
    const db = new PostgresDb(database.sql);
    await setSharing(db, fixtureAccount, fixtureCharacter, true);
    await database.sql`UPDATE characters SET account_id = ${fixtureOtherAccount}`;
    expect((await readCommunityFeed(database.sql)).posts).toEqual([]);
    expect((await sharingState(db, fixtureOtherAccount, fixtureCharacter)).enabled).toBe(false);
    await setSharing(db, fixtureOtherAccount, fixtureCharacter, true);
    expect((await readCommunityFeed(database.sql)).posts).toEqual([]);
  },
);

test.skipIf(!hasPostgres)(
  "reassignment protects unshared history even after the former owner is forgotten",
  async () => {
    const { PostgresDb } = await import("../../server/src/db");
    const { Store } = await import("../../server/src/store");
    const { setSharing } = await import("../../server/src/character-sharing");
    const { fixtureAccount, fixtureOtherAccount } = await import("./public-professions-fixture");
    const db = new PostgresDb(database.sql);
    await database.sql`UPDATE characters SET account_id = ${fixtureOtherAccount}`;
    const store = new Store(import.meta.dirname, { postgres: database.sql });
    try {
      await store.deleteAccountData(fixtureAccount);
    } finally {
      store.close();
    }
    await setSharing(db, fixtureOtherAccount, fixtureCharacter, true);
    expect((await readCommunityFeed(database.sql)).posts).toEqual([]);
    const id = `forever/${fixtureCharacter.realm}/${fixtureCharacter.name}`;
    await database.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'level_up', 'new-owner', 101, '25', '26')`;
    expect((await readCommunityFeed(database.sql)).posts.map((p) => p.label)).toEqual(["Level 26"]);
  },
);
