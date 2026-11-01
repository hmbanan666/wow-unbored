import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { test } from "vite-plus/test";

import { readFileSync } from "node:fs";

import { cleanSnapshot } from "../src/data.ts";
import { Store } from "../src/store.ts";
import { transfer, TransferError } from "../src/transfer.ts";
import { hasPostgres, testDatabase } from "./postgres-db.ts";

// ADR 0057 rollout step 6: the one-off SQLite -> Postgres transfer.
const pg = test.skipIf(!hasPostgres);
const run = promisify(execFile);
const at = (y: number, m: number, d = 1) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
const SCRIPT = new URL("../scripts/sqlite-to-postgres.ts", import.meta.url).pathname;

/** A Store's SQLite file with a row or more in every table. */
async function fixture(extra?: (db: DatabaseSync) => void): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "unbored-transfer-"));
  new Store(dir).close();
  const file = path.join(dir, "unbored.sqlite");
  const db = new DatabaseSync(file);
  // The closed Store may still finish its startup backfill: wait for its lock.
  for (let i = 0; ; i++) {
    try {
      db.exec("BEGIN IMMEDIATE");
      break;
    } catch (error) {
      if (i > 200 || !/locked|busy/.test((error as Error).message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  const now = at(2026, 11, 1);
  db.exec(`
    INSERT INTO accounts VALUES ('A', 'Brozin#1', ${now - 99}, ${now}, '{"z":1,"a":[1,2,{"y":null,"b":"ы"}]}');
    INSERT INTO characters VALUES ('c1', 'A', 'Brozin', 'Gordunni', 'MAGE', 80, ${now}, ${now - 5}, NULL, 'd1');
    INSERT INTO sections_latest VALUES ('char', 'c1', 'bags', 3, 'h1', ${now}, ${now}, ${now}, 'addon', 0, 42,
      '{"items":[{"id":1,"n":2.5}],"big":1e3}');
    INSERT INTO section_history (id, owner_kind, owner_id, section, at, saved_at, hash, kind, body_json)
      VALUES (5, 'char', 'c1', 'bags', ${at(2025, 3, 15)}, NULL, 'h0', 'full', '{"items":[]}'),
             (9, 'char', 'c1', 'bags', ${at(2026, 10, 1)}, ${now}, 'h1', 'diff', '{"add":[1]}');
    INSERT INTO data_meta VALUES ('k', 'v');
    INSERT INTO addon_errors VALUES ('e1', 'A', 'd1', 'Brozin', 'Gordunni', '0.10.0', 'Core/Plan.lua:1', 'boom', 'stack', 2, ${now - 9}, ${now}, ${now});
    INSERT INTO plans (id, player_key, created_at, body_json, unb1, generated_at, request_id)
      VALUES (1, 'p', ${now}, '{"steps":[]}', 'UNB1:x', NULL, NULL), (7, 'p', ${now}, '{"b":2,"a":1}', 'UNB1:y', ${now}, 'r1');
    INSERT INTO progress (id, player_key, created_at, account, realm, character, saved_at, body_json)
      VALUES (2, 'p', ${now}, 'A', 'Gordunni', 'Brozin', NULL, '{"done":[1]}');
    INSERT INTO requests (id, device_id, character_name, realm, mode, budget, status, plan_id, created_at, updated_at, context_json, item_json)
      VALUES ('r1', 'd1', 'Brozin', 'Gordunni', 'surprise', 60, 'done', 7, ${now}, ${now}, '{"wish":"x"}', NULL);
    INSERT INTO devices VALUES ('d1', 'PC', 'secret-hash', 'active', ${now}, NULL, 0);
    INSERT INTO history (id, at, account, character_name, realm, kind, ref, body_json)
      VALUES (3, ${at(2024, 6, 1)}, 'A', 'Brozin', 'Gordunni', 'win', NULL, '{"old":true}'),
             (4, ${now}, 'A', 'Brozin', 'Gordunni', 'win', 'x', '[1,"two"]');
    INSERT INTO advice VALUES ('Brozin', 'Gordunni', 'A', 19019, '{"tip":"sell"}', ${now});
    INSERT INTO webhook_deliveries VALUES ('r1', 1, ${now}, NULL, 200, NULL, ${now});
    INSERT INTO chain_progress VALUES ('c1', 5492, 3, ${now});
    INSERT INTO suggestions VALUES ('A', 'c1', ${now}, '{"list":[]}');
    INSERT INTO game_ids VALUES ('achievement', 6, 1, ${now});
    INSERT INTO creature_names VALUES (1, 'enUS', NULL, ${now});
    INSERT INTO profiles (character_name, realm, device_id, saved_at, updated_at, body_json, account)
      VALUES ('Brozin', 'Gordunni', 'd1', NULL, ${now}, '{}', 'A');
  `);
  extra?.(db);
  db.exec("COMMIT");
  db.close();
  return file;
}

pg("every table is copied, JSON as jsonb objects, partitions back to the oldest row", async () => {
  const file = await fixture();
  const db = await testDatabase({ migrated: false });
  try {
    const lines: string[] = [];
    const report = await transfer({ sqlitePath: file, sql: db.sql, log: (l) => lines.push(l) });
    assert.equal(report.committed, true);
    assert.equal(report.tables.length, 17);
    assert.deepEqual(report.skipped, [
      { table: "profile_snapshots", rows: 0 },
      { table: "profiles", rows: 1 },
    ]);
    assert.ok(
      report.tables.every((t) => t.rows >= 1),
      JSON.stringify(report.tables),
    );
    assert.ok(lines.some((l) => /^history: 2 rows, checksum [0-9a-f]{16} ok$/.test(l)));

    const [account] = await db.sql`SELECT jsonb_typeof(dropped_json) AS t, dropped_json AS v
      FROM accounts WHERE id = 'A'`;
    assert.equal(account.t, "object");
    assert.deepEqual(account.v, { z: 1, a: [1, 2, { y: null, b: "ы" }] });
    const [history] = await db.sql`SELECT tableoid::regclass::text AS part, body
      FROM history WHERE id = 3`;
    assert.deepEqual([history.part, history.body], ["history_y2024m06", { old: true }]);
    const [error] = await db.sql`SELECT "where", count FROM addon_errors`;
    assert.deepEqual([error.where, error.count], ["Core/Plan.lua:1", 2]);
    const [request] = await db.sql`SELECT context_json, item_json, type FROM requests`;
    assert.deepEqual(
      [request.context_json, request.item_json, request.type],
      [{ wish: "x" }, null, "plan"],
    );

    // Identity sequences continue after the copied ids.
    const [plan] = await db.sql`INSERT INTO plans (player_key, created_at, body, unb1)
      VALUES ('p', 1, '{}', 'u') RETURNING id`;
    assert.equal(Number(plan.id), 8);
    const [row] = await db.sql`INSERT INTO history (at, character_name, realm, kind, body)
      VALUES (${at(2026, 11, 2)}, 'B', 'R', 'win', '{}') RETURNING id`;
    assert.equal(Number(row.id), 5);
  } finally {
    await db.drop();
  }
});

pg("a target with rows is refused unless --force, which replaces them", async () => {
  const file = await fixture();
  const db = await testDatabase();
  try {
    const first = await transfer({ sqlitePath: file, sql: db.sql });
    await assert.rejects(
      transfer({ sqlitePath: file, sql: db.sql }),
      /already has rows in .*accounts/,
    );
    await db.sql`INSERT INTO raw_uploads (account_id, device_id, character_id, hash, body_gz, bytes, received_at)
      VALUES ('A', 'd1', 'c1', 'h', ${Buffer.from("x")}, 1, 1)`;
    const again = await transfer({ sqlitePath: file, sql: db.sql, force: true, batchRows: 1 });
    assert.deepEqual(again.tables, first.tables);
    const [left] = await db.sql`SELECT
      (SELECT count(*)::int FROM raw_uploads) AS uploads,
      (SELECT count(*)::int FROM plans) AS plans`;
    assert.deepEqual([left.uploads, left.plans], [0, 2]);
  } finally {
    await db.drop();
  }
});

pg(
  "a dry run copies and verifies a snapshot of the file, then leaves the target empty",
  async () => {
    const file = await fixture();
    const db = await testDatabase();
    try {
      const report = await transfer({ sqlitePath: file, sql: db.sql, dryRun: true });
      assert.equal(report.committed, false);
      assert.equal(report.tables.find((t) => t.table === "history")?.rows, 2);
      const [left] = await db.sql`SELECT (SELECT count(*)::int FROM accounts) AS accounts,
      to_regclass('history_y2024m06') AS part`;
      assert.deepEqual([left.accounts, left.part], [0, null]);
      // And a real run still works after it.
      assert.equal((await transfer({ sqlitePath: file, sql: db.sql })).committed, true);
    } finally {
      await db.drop();
    }
  },
);

pg("a checksum mismatch fails loudly and commits nothing", async () => {
  const file = await fixture();
  const db = await testDatabase();
  try {
    // A target that silently changes data on the way in.
    await db.sql.unsafe(`
      CREATE FUNCTION mangle() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.label := NEW.label || '!'; RETURN NEW; END $$;
      CREATE TRIGGER mangle BEFORE INSERT ON accounts FOR EACH ROW EXECUTE FUNCTION mangle();`);
    const lines: string[] = [];
    await assert.rejects(
      transfer({ sqlitePath: file, sql: db.sql, log: (l) => lines.push(l) }),
      (error: Error) => error instanceof TransferError && /differ in accounts;/.test(error.message),
    );
    assert.ok(lines.some((l) => l.startsWith("accounts: 1 rows") && l.includes("MISMATCH")));
    const [left] = await db.sql`SELECT (SELECT count(*)::int FROM accounts) AS a,
      (SELECT count(*)::int FROM plans) AS p`;
    assert.deepEqual([left.a, left.p], [0, 0]);
  } finally {
    await db.drop();
  }
});

pg("unknown tables and broken JSON stop the transfer", async () => {
  const db = await testDatabase();
  try {
    const extraTable = await fixture((sqlite) => sqlite.exec(`CREATE TABLE mystery (id INTEGER)`));
    await assert.rejects(
      transfer({ sqlitePath: extraTable, sql: db.sql }),
      /mystery has no Postgres table/,
    );
    const badJson = await fixture((sqlite) =>
      sqlite.exec(`UPDATE plans SET body_json = '{nope' WHERE id = 7`),
    );
    await assert.rejects(
      transfer({ sqlitePath: badJson, sql: db.sql }),
      /plans\.body_json: not JSON/,
    );
    const [left] = await db.sql`SELECT count(*)::int AS n FROM accounts`;
    assert.equal(left.n, 0);
  } finally {
    await db.drop();
  }
});

pg("the script runs under node as in the Docker image, URL from the environment only", async () => {
  const file = await fixture();
  const db = await testDatabase({ migrated: false });
  const node = (args: string[], env: NodeJS.ProcessEnv) =>
    run(
      process.execPath,
      ["--experimental-sqlite", "--experimental-strip-types", SCRIPT, ...args],
      {
        env: { PATH: process.env.PATH, ...env },
      },
    );
  try {
    await assert.rejects(
      node(["--sqlite", file], {}),
      (error: { code: number; stderr: string }) => {
        assert.equal(error.code, 2);
        assert.match(error.stderr, /DATABASE_URL must be set/);
        return true;
      },
    );
    const dry = await node(["--sqlite", file, "--dry-run"], { DATABASE_URL: db.url });
    assert.match(dry.stdout, /Dry run ok, rolled back: 17 tables, \d+ rows verified/);
    const real = await node([], { DATABASE_URL: db.url, UNBORED_DATA_DIR: path.dirname(file) });
    assert.match(real.stdout, /Committed: 17 tables/);
    await assert.rejects(
      node(["--sqlite", file], { DATABASE_URL: db.url }),
      (error: { code: number; stderr: string }) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Transfer FAILED, nothing committed: .*--force/);
        return true;
      },
    );
  } finally {
    await db.drop();
  }
});

pg("a Postgres Store reads what a SQLite Store wrote, after the transfer", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "unbored-transfer-"));
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const now = at(2026, 10, 20);
  const read = async (store: Store) => {
    const characters = await store.data.characters();
    return {
      accounts: await store.data.accounts(),
      characters,
      overview: await Promise.all(characters.map((row) => store.data.overview(row))),
      sections: await Promise.all(characters.map((row) => store.data.sectionsFor(row))),
      history: await store.data.history({
        owners: characters.flatMap((row) => [
          { kind: "char" as const, id: row.id },
          { kind: "account" as const, id: row.accountId },
        ]),
        limit: 100,
      }),
    };
  };
  const sqliteStore = new Store(dir);
  await sqliteStore.registerDevice({
    id: "pc-1",
    name: "PC",
    secretHash: "h1",
    nowSeconds: now,
    pendingCap: 10,
  });
  await sqliteStore.putSnapshot(cleanSnapshot({ ...raw, savedAt: now - 60 }), "pc-1", now - 60);
  const before = await read(sqliteStore);
  sqliteStore.close();
  assert.ok(before.characters.length >= 1);
  assert.ok(before.history.length >= 1);

  const db = await testDatabase();
  try {
    await transfer({ sqlitePath: path.join(dir, "unbored.sqlite"), sql: db.sql });
    const pgStore = new Store(mkdtempSync(path.join(tmpdir(), "unbored-transfer-")), {
      postgres: db.sql,
    });
    try {
      assert.deepEqual(await read(pgStore), before);
    } finally {
      pgStore.close();
    }
  } finally {
    await db.drop();
  }
});
