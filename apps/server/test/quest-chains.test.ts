import { test, expect } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createApp } from "../src/app.ts";
import { cleanSnapshot } from "../src/data.ts";
import { publishQuestChains, readQuestChainProgress } from "../src/quest-chains.ts";
import { NOW } from "./helpers.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
const pg = postgresPerFile();
for (const backend of BACKENDS)
  test(`chains stay draft until all step ids have real evidence (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".chains-"));
    const built = createApp({
      dataDir: dir,
      database: pg(backend),
      ingest: "inline",
      companionToken: "companion",
      plannerToken: "owner",
      blizzard: null,
      webhook: { url: "", key: "", headerName: "" },
      log: () => {},
    });
    const store = built.store;
    const chain = {
      slug: "beginning",
      title: "A beginning",
      faction: "Both",
      zone: "Elwynn Forest",
      status: "published",
      steps: [
        { questID: 42, title: "A beginning" },
        { questID: 43, title: "Next" },
      ],
    };
    try {
      expect((await publishQuestChains(store.db, [chain]))[0]).toMatchObject({
        status: "draft",
        missing: [42, 43],
      });
      await store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          game: "forever",
          account: "a",
          character: "Hero",
          realm: "Realm",
          savedAt: NOW,
          sections: {
            questsDone: { scope: "char", v: 1, at: NOW, body: { ids: ["ids1", "16,1"], count: 2 } },
          },
        }),
        "a",
        NOW,
      );
      expect((await publishQuestChains(store.db, [chain]))[0]).toMatchObject({
        status: "published",
        missing: [],
      });
      const [character] = await store.data.characters("a");
      const response = await built.app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer owner",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_quest_chain_progress",
            arguments: { game: "forever", character: "Hero", slug: "beginning" },
          },
        }),
      });
      const rpc = await response.json();
      expect(rpc.result.isError).toBe(false);
      expect(
        JSON.parse(rpc.result.content[0].text).steps.map((s: { done: boolean }) => s.done),
      ).toEqual([true, true]);
      const progress = await readQuestChainProgress(store.db, character!, "beginning");
      expect(progress?.steps.map((s) => s.done)).toEqual([true, true]);
      expect(
        await readQuestChainProgress(store.db, { ...character!, game: "retail" }, "beginning"),
      ).toBeNull();
      await store.deleteAccountData("a");
      expect(await readQuestChainProgress(store.db, character!, "beginning")).toBeNull();
    } finally {
      built.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
