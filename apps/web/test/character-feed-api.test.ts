import { test, expect } from "vite-plus/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "../../server/src/app.ts";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db.ts";
import { seedPublicProfessions, fixtureCharacter } from "./public-professions-fixture";
test.skipIf(!hasPostgres)(
  "feed mutations require a live owner session and same origin",
  async () => {
    const database = await testDatabase();
    const directory = await mkdtemp(join(import.meta.dirname, ".feed-api-"));
    const built = createApp({
      dataDir: directory,
      database: database.sql,
      companionToken: "fixture",
      plannerToken: "fixture-owner",
      webOrigin: "https://playunbored.com",
      log: () => {},
    });
    try {
      await seedPublicProfessions(database.sql);
      const identity = { realm: fixtureCharacter.realm, name: fixtureCharacter.name };
      const request = (session: string, method = "GET", origin = "https://playunbored.com") =>
        built.app.request(
          `/v1/web/feed/sharing${method === "GET" ? `?${new URLSearchParams(identity)}` : ""}`,
          {
            method,
            headers: {
              authorization: `Bearer ${session}`,
              origin,
              "content-type": "application/json",
            },
            ...(method === "PUT" ? { body: JSON.stringify({ ...identity, enabled: true }) } : {}),
          },
        );
      expect((await request("")).status).toBe(401);
      expect((await request("other-fixture-session")).status).toBe(404);
      expect(await (await request("fixture-session")).json()).toMatchObject({ enabled: false });
      expect((await request("fixture-session", "PUT", "https://elsewhere.example")).status).toBe(
        403,
      );
      expect(await (await request("fixture-session", "PUT")).json()).toMatchObject({
        enabled: true,
      });
      const { createHash } = await import("node:crypto");
      const deviceSecret = "local-feed-device-fixture";
      await database.sql`UPDATE devices SET secret_hash = ${createHash("sha256").update(deviceSecret).digest("hex")} WHERE id = 'fixture-device'`;
      await database.sql`UPDATE characters SET device_id = 'fixture-device'`;
      const deviceRead = (secret: string, name = identity.name) =>
        built.app.request(`/v1/feed/sharing?${new URLSearchParams({ ...identity, name })}`, {
          headers: { authorization: `Bearer ${secret}` },
        });
      expect((await deviceRead("fixture")).status).toBe(401);
      expect((await deviceRead("invalid")).status).toBe(401);
      expect((await deviceRead(deviceSecret, "Other")).status).toBe(404);
      expect(await (await deviceRead(deviceSecret)).json()).toMatchObject({ enabled: true });
      await database.sql`UPDATE devices SET status = 'revoked' WHERE id = 'fixture-device'`;
      expect((await request("fixture-session")).status).toBe(401);
      expect((await request("fixture-session", "PUT")).status).toBe(401);
    } finally {
      await built.close();
      await database.drop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
