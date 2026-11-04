import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { Store } from "../src/store.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";

import { coreCsv, coreResponse } from "./game-content-fixture.ts";

const pg = postgresPerFile();
const build = "12.0.1.66337";

for (const backend of BACKENDS) {
  test(`streamed names survive quotes, newlines and split UTF-8 bytes (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".game-content-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      await store.game.importBuild(build, async (input) => {
        if (!new URL(String(input)).pathname.includes("/ItemSparse/")) return coreResponse(input);
        const bytes = new TextEncoder().encode(
          '\uFEFFID,Display_lang,Ignored\r\n19019,"Летим, ""ещё""!\nAgain",unused\r\n',
        );
        let offset = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(bytes.subarray(offset, offset + 7));
              offset += 7;
              if (offset >= bytes.length) controller.close();
            },
          }),
        );
      });
      assert.deepEqual((await store.game.row("ItemSparse", 19019, "ruRU"))?.fields, {
        ID: 19019,
        Display_lang: 'Летим, "ещё"!\nAgain',
      });
      assert.equal((await store.game.row("QuestV2", 90001, "ruRU"))?.fields.UniqueBitFlag, 42);
      assert.equal(await store.game.row("QuestV2", 99999), undefined);
      assert.ok(!readdirSync(dir).some((name) => name.startsWith(".game-import-")));
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`invalid sources never publish partial content or leave staged files (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".game-content-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      for (const csv of [
        "ID,Display_lang\n19019,One\n19019,Duplicate\n",
        "ID,Display_lang\n-1,Negative id\n",
        "ID,Display_lang\n2147483648,Too large id\n",
        "ID,Display_lang\n19019,Missing,Extra column\n",
        'ID,Display_lang\n19019,Unquoted "quote"\n',
        'ID,Display_lang\n19019,"Truncated',
        'ID,Display_lang\n19019,"Closed"unexpected\n',
        "ID,Display_lang\n19019," + "x".repeat(262_145),
        "ID,Display_lang,Display_lang\n19019,One,Two\n",
        "ID,Display_lang\n",
      ]) {
        await assert.rejects(
          store.game.importBuild(build, async (input) =>
            new URL(String(input)).pathname.includes("/ItemSparse/")
              ? new Response(csv)
              : coreResponse(input),
          ),
        );
        assert.equal(await store.game.currentBuild(), undefined);
        assert.equal(await store.game.row("QuestV2", 90001), undefined);
        assert.ok(!readdirSync(dir).some((name) => name.startsWith(".game-import-")));
      }
      await store.game.importBuild(build, coreResponse);
      assert.equal((await store.game.row("QuestV2", 90001))?.build, build);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`client map coordinates in scientific notation remain usable (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".game-content-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      await store.game.importBuild(build, async (input) =>
        new URL(String(input)).pathname.includes("/UiMapAssignment/")
          ? new Response(coreCsv.UiMapAssignment.replace(",0,0,1,1\n", ",0,3.69549E-6,1,1\n"))
          : coreResponse(input),
      );
      assert.equal((await store.game.row("UiMapAssignment", 1))?.fields.UiMin_1, 0.00000369549);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`a mismatched locale preserves the previous complete build and permits retry (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".game-content-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      await store.game.importBuild(build, coreResponse);
      const newer = "12.0.1.66338";
      await assert.rejects(
        store.game.importBuild(newer, async (input) => {
          const url = new URL(String(input));
          return url.pathname.includes("ItemSparse") && url.searchParams.get("locale") === "ruRU"
            ? new Response("ID,Display_lang\n19020,Another item\n")
            : coreResponse(input);
        }),
      );
      assert.equal((await store.game.row("QuestV2", 90001))?.build, build);
      await store.game.importBuild(newer, coreResponse);
      assert.equal((await store.game.row("QuestV2", 90001))?.build, newer);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`core import makes all selected content available from the current build (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".game-content-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      const imported = await store.game.importBuild(build, coreResponse);
      assert.deepEqual(Object.keys(imported.tables).sort(), Object.keys(coreCsv).sort());
      assert.ok(Object.values(imported.tables).every((count) => count === 1));
      assert.deepEqual(await store.game.row("Achievement", 964), {
        build,
        fields: {
          ID: 964,
          Title_lang: "Going Down?",
          Description_lang: "Fall",
          Instance_ID: 0,
          Criteria_tree: 100,
        },
      });
      assert.deepEqual(await store.game.row("QuestPOIPoint", 201), {
        build,
        fields: { ID: 201, QuestPOIBlobID: 200, X: 25, Y: 75 },
      });
      assert.equal((await store.game.row("Map", 0))?.fields.ExpansionID, 0);
      assert.equal(
        (await store.game.row("ItemSparse", 19019, "ruRU"))?.fields.Display_lang,
        "Thunderfury",
      );
      assert.deepEqual(await store.game.row("QuestV2", 90001), {
        build,
        fields: { ID: 90001, UniqueBitFlag: 42 },
      });
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
