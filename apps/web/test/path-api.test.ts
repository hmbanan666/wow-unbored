import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { forwardPathRequest } from "../server/utils/path-api.ts";

test("the website proxy rejects cross-origin writes before contacting the Server", async () => {
  let called = false;
  const response = await forwardPathRequest(
    {
      method: "PUT",
      origin: "https://elsewhere.example",
      siteOrigin: "https://playunbored.com",
      fetchSite: "cross-site",
      contentType: "application/json",
      body: {},
      sessionId: "session",
      serverUrl: "http://server",
      ip: "192.0.2.1",
    },
    async () => {
      called = true;
      return new Response("{}");
    },
  );
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("the website proxy sends only its session credential and forwards rate limits without caching", async () => {
  const response = await forwardPathRequest(
    {
      method: "PUT",
      origin: "https://playunbored.com",
      siteOrigin: "https://playunbored.com",
      fetchSite: "same-origin",
      contentType: "application/json",
      body: { character: "Mira" },
      sessionId: "private-session",
      serverUrl: "http://server/",
      ip: "192.0.2.1",
    },
    async (url, init) => {
      assert.equal(url, "http://server/v1/web/paths/active");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer private-session");
      assert.equal(headers.get("x-forwarded-for"), "192.0.2.1");
      return new Response('{"error":"too_many_attempts"}', { status: 429 });
    },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.text()).includes("private-session"), false);
});
