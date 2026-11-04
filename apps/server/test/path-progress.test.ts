import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { packIds } from "@unbored/contracts";

import { ContentStore } from "../src/content.ts";
import { Store } from "../src/store.ts";
import { coreCsv, coreResponse } from "./game-content-fixture.ts";
import { snapshot, packCounts, NOW, ACCOUNT_KEY } from "./helpers.ts";
import { hasPostgres, postgresPerFile } from "./postgres-db.ts";
import { goalFixtures } from "./path-progress-fixtures.ts";
import { createApp } from "../src/app.ts";

const pg = postgresPerFile();
const mount = {
  kind: "mount",
  id: 6,
  name: "Brown Horse",
  required: true,
  source: { type: "vendor", text: "Stable" },
  chance: true,
  note: "Collect it.",
};
const collection = {
  kind: "collection",
  slug: "first-mounts",
  title: "First mounts",
  description: "Mounts to collect.",
  items: [mount],
};
async function setup() {
  const sql = pg("postgres")!;
  await sql`DELETE FROM content.paths`;
  const dir = mkdtempSync(path.join(import.meta.dirname, ".path-progress-"));
  const store = new Store(dir, { postgres: sql });
  await store.game.importBuild("12.0.1.66337", coreResponse);
  const content = new ContentStore(store.db, store.game);
  return {
    store,
    content,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test.skipIf(!hasPostgres)(
  "published Collection progress counts an Account mount for each Character",
  async () => {
    const { store, content, close } = await setup();
    try {
      await content.saveDraft(collection);
      await content.publish("collection", collection.slug);
      await store.putSnapshot(
        snapshot({ char: { body: { level: 80 } } }, { character: "Alt" }),
        "device",
        NOW,
      );
      await store.putSnapshot(snapshot({ mounts: { body: { ids: packIds([6]) } } }), "device", NOW);
      const rows = await store.pathProgress({ account: ACCOUNT_KEY });
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.equal(row.paths[0].done, 1);
        assert.equal(row.paths[0].total, 1);
        assert.equal(row.paths[0].goals[0].done, true);
      }
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)("the authenticated API and MCP expose the same progress", async () => {
  const sql = pg("postgres")!;
  const dir = mkdtempSync(path.join(import.meta.dirname, ".path-api-"));
  const built = createApp({
    dataDir: dir,
    database: sql,
    companionToken: "c",
    plannerToken: "p",
    log: () => {},
  });
  try {
    await sql`DELETE FROM content.paths`;
    await built.store.game.importBuild("12.0.1.66337", coreResponse);
    const content = new ContentStore(built.store.db, built.store.game);
    await content.saveDraft(collection);
    await content.publish("collection", collection.slug);
    await built.store.putSnapshot(
      snapshot({ mounts: { body: { ids: packIds([6]) } } }),
      "device",
      NOW,
    );
    const url = `/v1/paths/progress?account=${ACCOUNT_KEY}&character=Mira&realm=Realm`;
    assert.equal((await built.app.request(url)).status, 401);
    assert.equal(
      (await built.app.request(url, { headers: { authorization: "Bearer c" } })).status,
      401,
    );
    const response = await built.app.request(url, { headers: { authorization: "Bearer p" } });
    assert.equal(response.status, 200);
    const api = await response.json();
    assert.equal(api.characters[0].paths[0].done, 1);
    const mcp = await built.app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer p",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_path_progress",
          arguments: { account: ACCOUNT_KEY, character: "Mira", realm: "Realm" },
        },
      }),
    });
    const reply = await mcp.json();
    assert.equal(reply.result.isError, false, JSON.stringify(reply));
    assert.deepEqual(JSON.parse(reply.result.content[0].text), api);
    assert.equal(
      (await built.app.request("/v1/paths/progress", { headers: { authorization: "Bearer p" } }))
        .status,
      400,
    );
  } finally {
    built.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const fixture of goalFixtures) {
  test.skipIf(!hasPostgres)(
    `${fixture.goal.kind} progress comes from the owning Character or Account snapshot`,
    async () => {
      const { store, content, close } = await setup();
      try {
        const doc = {
          ...collection,
          kind: "path",
          tier: "basic",
          items: [{ ...mount, id: undefined, ...fixture.goal }],
        };
        await content.saveDraft(doc);
        await content.publish("path", doc.slug);
        await store.putSnapshot(snapshot({}), "device", NOW);
        assert.equal((await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0].done, 0);
        await store.putSnapshot(snapshot(fixture.sections), "device", NOW);
        await store.putSnapshot(snapshot({}, { character: "Alt" }), "device", NOW);
        const rows = await store.pathProgress({ account: ACCOUNT_KEY });
        assert.equal(rows.find((row) => row.character === "Mira")!.paths[0].done, 1);
        assert.equal(
          rows.find((row) => row.character === "Alt")!.paths[0].done,
          fixture.accountWide ? 1 : 0,
        );
        await store.putSnapshot(
          snapshot({}, { account: "222222#1", character: "Stranger" }),
          "other",
          NOW,
        );
        assert.equal((await store.pathProgress({ account: "222222" }))[0].paths[0].done, 0);
      } finally {
        close();
      }
    },
  );
}

test.skipIf(!hasPostgres)(
  "uploads record completion once per Character and published version, ignoring optional goals and drafts",
  async () => {
    const { store, content, close } = await setup();
    try {
      const doc = {
        ...collection,
        items: [
          mount,
          {
            ...mount,
            kind: "achievement",
            id: 964,
            name: "Going Down?",
            required: false,
          },
        ],
      };
      await content.saveDraft(doc);
      await store.putSnapshot(snapshot({ mounts: { body: { ids: packIds([6]) } } }), "device", NOW);
      assert.equal((await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths.length, 0);
      await content.publish("collection", doc.slug);
      await store.putSnapshot(snapshot({}), "device", NOW + 1);
      const history = () =>
        store.history({ account: ACCOUNT_KEY, kinds: ["path_completion"], limit: 100 });
      assert.equal(
        (await history()).length,
        1,
        "the upload records completion without a progress read",
      );
      await Promise.all(
        Array.from({ length: 4 }, () => store.pathProgress({ account: ACCOUNT_KEY })),
      );
      await store.putSnapshot(snapshot({}), "device", NOW + 2);
      assert.equal((await history()).length, 1);
      const progress = (await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0];
      assert.equal(progress.done, 1);
      assert.equal(progress.total, 1);
      assert.equal(progress.goals[1].done, false);
      assert.equal(progress.completedAt, NOW + 1);
      await content.saveDraft({ ...doc, title: "More mounts" });
      assert.equal((await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0].version, 1);
      await content.publish("collection", doc.slug);
      await store.pathProgress({ account: ACCOUNT_KEY });
      assert.deepEqual(
        (await history()).map((row) => (row.body as { version: number }).version).sort(),
        [1, 2],
      );
      await store.putSnapshot(snapshot({}, { character: "Alt" }), "device", NOW + 3);
      assert.equal((await history()).length, 3);
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "completion survives spent currency and history retention; Forget my data removes it",
  async () => {
    const { store, content, close } = await setup();
    try {
      const fixture = goalFixtures.find((row) => row.goal.kind === "currency")!;
      const doc = {
        ...collection,
        kind: "path",
        tier: "basic",
        items: [{ ...mount, ...fixture.goal }],
      };
      await content.saveDraft(doc);
      await content.publish("path", doc.slug);
      await store.registerDevice({
        id: "device",
        name: "PC",
        secretHash: "test-hash",
        nowSeconds: NOW,
        pendingCap: 10,
      });
      await store.setDeviceStatus("device", "approved");
      await store.putSnapshot(snapshot(fixture.sections), "device", NOW);
      const progress = async () =>
        (await store.pathProgress({ account: ACCOUNT_KEY }))[0]?.paths[0];
      assert.equal((await progress()).completedAt, NOW);
      await store.putSnapshot(
        snapshot(
          { currencies: { at: NOW + 1, body: { list: [{ id: 2000, quantity: 49 }] } } },
          { savedAt: NOW + 1 },
        ),
        "device",
        NOW + 1,
      );
      assert.equal((await progress()).done, 0);
      assert.equal((await progress()).completedAt, NOW);
      // Simulate the history retention job removing the old entry, not its guard.
      await store.db.run("DELETE FROM history WHERE kind = 'path_completion'");
      await store.putSnapshot(
        snapshot(
          { currencies: { at: NOW + 2, body: { list: [{ id: 2000, quantity: 51 }] } } },
          { savedAt: NOW + 2 },
        ),
        "device",
        NOW + 2,
      );
      assert.equal((await progress()).completedAt, NOW);
      assert.equal(
        (await store.history({ account: ACCOUNT_KEY, kinds: ["path_completion"], limit: 100 }))
          .length,
        0,
      );
      await store.forgetDevice("device", NOW + 3);
      assert.deepEqual(await store.pathProgress({ account: ACCOUNT_KEY }), []);
      assert.equal((await store.history({ account: ACCOUNT_KEY, limit: 100 })).length, 0);
      // A newly paired Device may start again, without retaining the old completion.
      await store.putSnapshot(snapshot(fixture.sections), "new-device", NOW + 4);
      assert.equal((await progress()).completedAt, NOW + 4);
      assert.equal(
        (await store.history({ account: ACCOUNT_KEY, kinds: ["path_completion"], limit: 100 }))
          .length,
        1,
      );
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "unknown Section versions and zero required goals never record completion",
  async () => {
    const { store, content, close } = await setup();
    try {
      await content.saveDraft(collection);
      await content.publish("collection", collection.slug);
      await store.putSnapshot(
        snapshot({ mounts: { v: 99, body: { ids: packIds([6]) } } }),
        "device",
        NOW,
      );
      assert.equal((await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0].done, 0);
      await content.saveDraft({ ...collection, items: [{ ...mount, required: false }] });
      await content.publish("collection", collection.slug);
      const progress = (await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0];
      assert.equal(progress.total, 0);
      assert.equal(progress.completedAt, null);
      assert.equal(
        (await store.history({ account: ACCOUNT_KEY, kinds: ["path_completion"], limit: 100 }))
          .length,
        0,
      );
    } finally {
      close();
    }
  },
);

for (const section of ["bags", "bank", "reagentBank", "warband"]) {
  test.skipIf(!hasPostgres)(`item progress reads positive counts in ${section}`, async () => {
    const { store, content, close } = await setup();
    try {
      const item = goalFixtures.find((row) => row.goal.kind === "item")!.goal;
      await content.saveDraft({ ...collection, items: [{ ...mount, ...item }] });
      await content.publish("collection", collection.slug);
      await store.putSnapshot(
        snapshot({ [section]: { body: { items: packCounts({ 19019: 0 }) } } }),
        "device",
        NOW,
      );
      assert.equal((await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0].done, 0);
      await store.putSnapshot(
        snapshot(
          { [section]: { at: NOW + 1, body: { items: packCounts({ 19019: 1 }) } } },
          { savedAt: NOW + 1 },
        ),
        "device",
        NOW + 1,
      );
      assert.equal((await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0].done, 1);
      await store.putSnapshot(snapshot({}, { character: "Alt" }), "device", NOW + 2);
      assert.equal(
        (await store.pathProgress({ account: ACCOUNT_KEY, character: "Alt" }))[0].paths[0].done,
        section === "warband" ? 1 : 0,
      );
    } finally {
      close();
    }
  });
}

test.skipIf(!hasPostgres)(
  "a quest line needs every member and stays on its published build",
  async () => {
    const { store, content, close } = await setup();
    try {
      await store.game.importBuild("12.0.1.66338", async (input) => {
        const table = new URL(String(input)).pathname.split("/")[2];
        return new Response(
          table === "QuestLineXQuest"
            ? "ID,QuestLineID,QuestID,OrderIndex\n11,10,90001,0\n12,10,90002,1\n"
            : table === "QuestV2"
              ? "ID,UniqueBitFlag\n90001,42\n90002,43\n"
              : coreCsv[table],
        );
      });
      const goal = goalFixtures.find((row) => row.goal.kind === "questLine")!.goal;
      const doc = {
        ...collection,
        kind: "path",
        tier: "basic",
        items: [mount, { ...mount, ...goal }],
      };
      await content.saveDraft(doc);
      await content.publish("path", doc.slug);
      await store.putSnapshot(
        snapshot({
          mounts: { body: { ids: packIds([6]) } },
          questsDone: { body: { ids: packIds([90001]) } },
        }),
        "device",
        NOW,
      );
      const progress = async () => (await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0];
      assert.equal((await progress()).done, 1);
      assert.equal((await progress()).total, 2);
      assert.equal((await progress()).completedAt, null);
      // The newest build has only one member; it cannot change an existing version.
      await store.game.importBuild("12.0.1.66339", coreResponse);
      assert.equal((await progress()).done, 1);
      await store.putSnapshot(
        snapshot(
          { questsDone: { at: NOW + 1, body: { ids: packIds([90001, 90002]) } } },
          { savedAt: NOW + 1 },
        ),
        "device",
        NOW + 1,
      );
      assert.equal((await progress()).done, 2);
      assert.equal((await progress()).completedAt, NOW + 1);
    } finally {
      close();
    }
  },
);

for (const [name, membership] of [
  ["empty", "11,20,90001,0\n"],
  ["unverified", "11,10,90002,0\n"],
  ["oversized", Array.from({ length: 257 }, (_, i) => `${i + 1},10,90001,${i}\n`).join("")],
]) {
  test.skipIf(!hasPostgres)(`${name} quest-line membership cannot record completion`, async () => {
    const { store, content, close } = await setup();
    try {
      await store.game.importBuild("12.0.1.66338", async (input) => {
        const table = new URL(String(input)).pathname.split("/")[2];
        return new Response(
          table === "QuestLineXQuest"
            ? `ID,QuestLineID,QuestID,OrderIndex\n${membership}`
            : coreCsv[table],
        );
      });
      const goal = goalFixtures.find((row) => row.goal.kind === "questLine")!.goal;
      await content.saveDraft({
        ...collection,
        kind: "path",
        tier: "basic",
        items: [{ ...mount, ...goal }],
      });
      await content.publish("path", collection.slug);
      await store.putSnapshot(
        snapshot({ questsDone: { body: { ids: packIds([90001, 90002]) } } }),
        "device",
        NOW,
      );
      const progress = (await store.pathProgress({ account: ACCOUNT_KEY }))[0].paths[0];
      assert.equal(progress.done, 0);
      assert.equal(progress.completedAt, null);
    } finally {
      close();
    }
  });
}
