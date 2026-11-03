import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { test, vi } from "vite-plus/test";

import { snapshotResultSchema, type SnapshotBody } from "@unbored/contracts";

import { createApp } from "../src/app.ts";
import { cleanSnapshot } from "../src/data.ts";
import { migrate } from "../src/postgres.ts";
import { Store } from "../src/store.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";

const pg = postgresPerFile();
const NOW = 1_790_000_000;
const account = "a".repeat(64);
const token = "freshness-test-token";
const headers = { authorization: `Bearer ${token}` };

for (const backend of BACKENDS) {
  for (const ingest of backend === "postgres"
    ? (["inline", "async"] as const)
    : (["inline"] as const)) {
    function build() {
      const logs: string[] = [];
      const built = createApp({
        dataDir: mkdtempSync(path.join(tmpdir(), "unbored-freshness-")),
        companionToken: token,
        plannerToken: "planner-test-token",
        database: pg(backend),
        ...(ingest === "inline" ? { ingest: "inline" as const } : {}),
        log: (line) => logs.push(line),
      });
      async function upload(payload: SnapshotBody) {
        const response = await built.app.request("/v1/snapshot", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json", "content-encoding": "gzip" },
          body: gzipSync(JSON.stringify(payload)),
        });
        assert.equal(response.status, ingest === "inline" ? 200 : 202);
        const answer = await response.json();
        if (ingest === "inline") return snapshotResultSchema.parse(answer);
        assert.equal(await built.inbox!.processNext(), true);
        const status = await built.app.request(`/v1/uploads/${answer.upload}`, { headers });
        assert.equal(status.status, 200);
        const done = await status.json();
        assert.equal(done.state, "done");
        return snapshotResultSchema.parse(done.result);
      }
      return { ...built, upload, logs };
    }

    const payload = (
      character: string,
      savedAt: number,
      at: number,
      count: number,
    ): SnapshotBody => ({
      schema: 2,
      account,
      character,
      realm: "Realm",
      savedAt,
      sections: { mounts: { scope: "account", v: 1, at, body: { count } } },
    });

    test(`interleaved Characters keep the Account Section with the newest read (${backend}, ${ingest})`, async () => {
      const built = build();
      try {
        await built.upload(payload("Mira", NOW + 200, NOW, 1));
        const fresh = await built.upload(payload("Brew", NOW + 100, NOW + 100, 2));
        assert.deepEqual(fresh.stored, ["mounts"]);
        assert.deepEqual(fresh.sections, { "account:mounts": "stored" });
        const old = await built.upload(payload("Mira", NOW + 300, NOW + 50, 3));
        assert.equal(old.stale, true);
        assert.deepEqual(old.sections, { "account:mounts": "stale" });
        assert.deepEqual(old.stored, []);
        const section = (await built.store.data.section("account", account, "mounts"))!;
        assert.deepEqual(section.body, { count: 2 });
        assert.equal(section.savedAt, NOW + 100);
        assert.equal(
          (await built.store.data.lastChange("account", account, "mounts"))!.savedAt,
          NOW + 100,
        );
        assert.equal((await built.store.data.character("Mira", "Realm"))!.savedAt, NOW + 300);
        assert.equal((await built.store.data.character("Brew", "Realm"))!.savedAt, NOW + 100);
        const newerRead = await built.upload(payload("Mira", NOW + 100, NOW + 150, 4));
        assert.deepEqual(newerRead.stored, ["mounts"]);
        assert.equal((await built.store.data.character("Mira", "Realm"))!.savedAt, NOW + 300);
        assert.deepEqual(
          built.logs.filter((line) => line.startsWith("Stale Section:")),
          ["Stale Section: account:mounts account=aaaaaaaa"],
        );
      } finally {
        built.close();
      }
    });

    test(`missing read times fall back to the file time, or accept without either (${backend}, ${ingest})`, async () => {
      const built = build();
      try {
        const first = payload("Mira", NOW + 200, NOW, 1);
        delete first.sections.mounts!.at;
        assert.deepEqual((await built.upload(first)).sections, { "account:mounts": "stored" });
        const older = structuredClone(first);
        older.savedAt = NOW + 100;
        older.sections.mounts!.body = { count: 2 };
        assert.deepEqual((await built.upload(older)).sections, { "account:mounts": "stale" });
        older.savedAt = null;
        older.sections.mounts!.at = null;
        assert.deepEqual((await built.upload(older)).sections, { "account:mounts": "stored" });
        assert.equal((await built.store.data.section("account", account, "mounts"))!.savedAt, null);
        assert.equal(
          (await built.store.data.lastChange("account", account, "mounts"))!.savedAt,
          null,
        );
        assert.equal((await built.store.data.character("Mira", "Realm"))!.savedAt, NOW + 200);
      } finally {
        built.close();
      }
    });

    test(`future read times are clamped and zero is a real read time (${backend}, ${ingest})`, async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
      const built = build();
      try {
        await built.upload(payload("Mira", NOW, NOW + 100_000, 1));
        assert.equal(
          (await built.store.data.section("account", account, "mounts"))!.savedAt,
          NOW + 300,
        );
        assert.equal(
          (await built.store.data.lastChange("account", account, "mounts"))!.savedAt,
          NOW + 300,
        );
        assert.equal((await built.upload(payload("Mira", NOW + 1, NOW + 299, 2))).stale, true);
        assert.equal((await built.upload(payload("Mira", NOW + 2, 0, 3))).stale, true);
        assert.deepEqual((await built.upload(payload("Mira", NOW + 3, NOW + 300, 4))).stored, [
          "mounts",
        ]);
      } finally {
        built.close();
        clock.mockRestore();
      }
    });

    test(`a 0.11 upload keeps the old result fields and adds each Section outcome (${backend}, ${ingest})`, async () => {
      const built = build();
      try {
        const fixture = JSON.parse(
          readFileSync(
            new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
            "utf8",
          ),
        ) as SnapshotBody;
        const first = await built.upload(fixture);
        const names = Object.keys(fixture.sections);
        assert.deepEqual(first.stored, names);
        assert.deepEqual(first.unchanged, []);
        assert.deepEqual(first.unknown, ["futureThing"]);
        assert.equal(first.stale, false);
        fixture.savedAt! += 1; // A new inbox entry, with the same Section bodies.
        const again = await built.upload(fixture);
        assert.deepEqual(again.stored, []);
        assert.deepEqual(again.unchanged, names);
        assert.deepEqual(
          again.sections,
          Object.fromEntries(
            names.map((name) => [`${fixture.sections[name]!.scope}:${name}`, "unchanged"]),
          ),
        );
        const mixed = payload("Mira", NOW, NOW, 1);
        mixed.sections.toys = { scope: "account", v: 1, at: NOW, body: { count: 1 } };
        mixed.sections.future = { scope: "char", v: 9, at: NOW, body: { count: 1 } };
        await built.upload(mixed);
        mixed.savedAt = NOW + 100;
        mixed.sections.mounts!.at = NOW + 100;
        mixed.sections.toys.at = NOW - 1;
        mixed.sections.toys.body = { count: 2 };
        mixed.sections.future.body = { count: 2 };
        const result = await built.upload(mixed);
        assert.deepEqual(result.stored, ["future"]);
        assert.deepEqual(result.unchanged, ["mounts"]);
        assert.deepEqual(result.unknown, ["future"]);
        assert.equal(result.stale, true);
        assert.deepEqual(result.sections, {
          "account:mounts": "unchanged",
          "account:toys": "stale",
          "char:future": "stored",
        });
        assert.equal(
          (await built.store.data.section("account", account, "mounts"))!.savedAt,
          NOW + 100,
        );
        assert.equal((await built.upload(payload("Mira", NOW + 200, NOW + 50, 3))).stale, true);
      } finally {
        built.close();
      }
    });
  }
}

for (const backend of BACKENDS) {
  test(`existing Section times migrate once without changing history or Characters (${backend})`, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "unbored-freshness-migration-"));
    const sql = pg(backend);
    let store = new Store(dir, { postgres: sql });
    try {
      await store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          account,
          character: "Mira",
          realm: "Realm",
          savedAt: NOW + 200,
          sections: {
            mounts: { scope: "account", v: 1, at: NOW, body: { count: 1 } },
            toys: { scope: "account", v: 1, body: { count: 1 } },
          },
        }),
        "pc-1",
        NOW + 200,
      );
      // Simulate the previous schema's file-based watermark.
      await store.db.run("UPDATE sections_latest SET saved_at = ?", NOW + 200);
      await store.db.run("UPDATE section_history SET saved_at = ?", NOW + 200);
      if (sql) await store.db.run("DELETE FROM schema_migrations WHERE version = 4");
      else await store.db.run("DELETE FROM data_meta WHERE key = 'section_freshness'");
      store.close();
      if (sql) await migrate(sql);
      store = new Store(dir, { postgres: sql });
      assert.equal((await store.data.section("account", account, "mounts"))!.savedAt, NOW);
      assert.equal((await store.data.section("account", account, "toys"))!.savedAt, NOW + 200);
      assert.equal((await store.data.lastChange("account", account, "mounts"))!.savedAt, NOW + 200);
      assert.equal((await store.data.character("Mira", "Realm"))!.savedAt, NOW + 200);
      // An unchanged body advances its key but leaves the original read time.
      await store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          account,
          character: "Mira",
          realm: "Realm",
          savedAt: NOW + 300,
          sections: { mounts: { scope: "account", v: 1, at: NOW + 100, body: { count: 1 } } },
        }),
        "pc-1",
        NOW + 300,
      );
      store.close();
      if (sql) assert.deepEqual(await migrate(sql), []);
      store = new Store(dir, { postgres: sql });
      assert.equal((await store.data.section("account", account, "mounts"))!.savedAt, NOW + 100);
    } finally {
      store.close();
    }
  });
}
