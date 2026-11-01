import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import {
  cleanUploads,
  dropOldPartitions,
  ensurePartitions,
  historyCutoff,
  RETENTION,
  RetentionJob,
  runRetention,
} from "../src/retention.ts";
import { hasPostgres, testDatabase } from "./postgres-db.ts";

// ADR 0057 rollout step 5: month partitions rolled ahead, history kept 13
// months, inbox rows kept 7 days (done) and 30 days (failed). Postgres only.
const pg = test.skipIf(!hasPostgres);
const at = (y: number, m: number, d = 1) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
const DAY = 24 * 60 * 60;

async function partitions(sql: Awaited<ReturnType<typeof testDatabase>>["sql"], parent: string) {
  const rows = await sql<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = ${parent}::regclass ORDER BY c.relname`;
  return rows.map((row) => row.name);
}

test("history keeps the 13 months before this one", () => {
  assert.equal(historyCutoff(at(2026, 11, 15)), at(2025, 10));
  assert.equal(historyCutoff(at(2026, 1, 1)), at(2024, 12));
  assert.equal(RETENTION.doneUploadDays, 7);
  assert.equal(RETENTION.failedUploadDays, 30);
});

pg("partitions are made for this month and the next two", async () => {
  const db = await testDatabase();
  try {
    const now = at(2031, 12, 20);
    assert.equal(await ensurePartitions(db.sql, now), 6);
    assert.equal(await ensurePartitions(db.sql, now), 0);
    const names = await partitions(db.sql, "history");
    for (const name of ["history_y2031m12", "history_y2032m01", "history_y2032m02"]) {
      assert.ok(names.includes(name), name);
    }
    assert.ok(!names.includes("history_y2032m03"));
    await db.sql`INSERT INTO history (at, character_name, realm, kind, body)
      VALUES (${at(2032, 2, 28)}, 'Mira', 'Realm', 'win', '{}')`;
  } finally {
    await db.drop();
  }
});

pg("partitions that ended 13 months ago are detached and dropped with their rows", async () => {
  const db = await testDatabase();
  try {
    const now = at(2026, 11, 1);
    for (const month of [9, 10]) {
      await db.sql`INSERT INTO history (at, character_name, realm, kind, body)
        VALUES (${at(2025, month, 15)}, 'Mira', 'Realm', 'win', '{}')`;
      await db.sql`INSERT INTO section_history (owner_kind, owner_id, section, at, hash, kind, body)
        VALUES ('char', 'c', 'bags', ${at(2025, month, 15)}, 'h', 'full', '{}')`;
    }
    const dropped = await dropOldPartitions(db.sql, now);
    assert.ok(dropped.includes("history_y2025m09"));
    assert.ok(dropped.includes("section_history_y2025m09"));
    assert.ok(dropped.includes("history_y2025m01"), "the empty months the schema made");
    assert.ok(!dropped.some((name) => name.endsWith("y2025m10")), "13 months stay");
    const [left] = await db.sql`SELECT
      (SELECT count(*)::int FROM history) AS history,
      (SELECT count(*)::int FROM section_history) AS sections,
      to_regclass('history_y2025m09') AS gone`;
    assert.deepEqual([left.history, left.sections, left.gone], [1, 1, null]);
    assert.equal((await partitions(db.sql, "history"))[0], "history_y2025m10");
    assert.deepEqual(await dropOldPartitions(db.sql, now), []);
  } finally {
    await db.drop();
  }
});

pg("a partition a crashed run left detached or pending is dropped too", async () => {
  const db = await testDatabase();
  try {
    await db.sql.unsafe(`ALTER TABLE history DETACH PARTITION history_y2025m02`);
    // A DETACH CONCURRENTLY cancelled while a reader holds an old snapshot
    // stays DETACH PENDING.
    const reader = await db.sql.reserve();
    const detacher = await db.sql.reserve();
    try {
      await reader`BEGIN ISOLATION LEVEL REPEATABLE READ`;
      await reader`SELECT count(*) FROM section_history`;
      await detacher`SET statement_timeout = 300`;
      await assert.rejects(
        detacher.unsafe(
          `ALTER TABLE section_history DETACH PARTITION section_history_y2025m03 CONCURRENTLY`,
        ),
        /statement timeout/,
      );
      await reader`COMMIT`;
    } finally {
      await detacher`RESET statement_timeout`;
      reader.release();
      detacher.release();
    }
    const [pending] = await db.sql`SELECT inhdetachpending AS p FROM pg_inherits
      WHERE inhrelid = 'section_history_y2025m03'::regclass`;
    assert.equal(pending.p, true);
    const dropped = await dropOldPartitions(db.sql, at(2026, 11, 1));
    assert.ok(dropped.includes("history_y2025m02"));
    assert.ok(dropped.includes("section_history_y2025m03"));
    const [row] = await db.sql`SELECT to_regclass('history_y2025m02') AS a,
      to_regclass('section_history_y2025m03') AS b`;
    assert.deepEqual([row.a, row.b], [null, null]);
  } finally {
    await db.drop();
  }
});

pg("inbox rows go 7 days after done and 30 days after failed", async () => {
  const db = await testDatabase();
  try {
    const now = at(2026, 11, 1);
    const rows: [string, string, number | null][] = [
      ["done-old", "done", now - 7 * DAY - 1],
      ["done-new", "done", now - 7 * DAY + 60],
      ["failed-mid", "failed", now - 8 * DAY],
      ["failed-old", "failed", now - 30 * DAY - 1],
      ["queued", "queued", null],
    ];
    for (const [hash, state, processed] of rows) {
      await db.sql`INSERT INTO raw_uploads
        (account_id, device_id, character_id, hash, body_gz, bytes, received_at, state, processed_at)
        VALUES ('A', 'd', 'c', ${hash}, ${Buffer.from("x")}, 1, ${now - 40 * DAY}, ${state}, ${processed})`;
    }
    assert.deepEqual(await cleanUploads(db.sql, now), { done: 1, failed: 1 });
    const left = await db.sql`SELECT hash FROM raw_uploads ORDER BY hash`;
    assert.deepEqual(
      left.map((row) => row.hash),
      ["done-new", "failed-mid", "queued"],
    );
  } finally {
    await db.drop();
  }
});

pg("one pass at a time across Servers; the job logs what it removed", async () => {
  const db = await testDatabase();
  try {
    const holder = await db.sql.reserve();
    await holder`SELECT pg_advisory_lock(${RETENTION.lock})`;
    try {
      assert.equal((await runRetention(db.sql, at(2026, 11, 1))).ran, false);
    } finally {
      await holder`SELECT pg_advisory_unlock(${RETENTION.lock})`;
      holder.release();
    }
    const lines: string[] = [];
    const job = new RetentionJob(
      db.sql,
      (line) => lines.push(line),
      () => at(2026, 11, 1),
    );
    const report = await job.start();
    await job.stop();
    assert.equal(report?.ran, true);
    assert.ok(report!.dropped.includes("history_y2025m01"));
    assert.match(lines.join("\n"), /Retention: made \d+ partitions, dropped history_y2025m01/);
  } finally {
    await db.drop();
  }
});
