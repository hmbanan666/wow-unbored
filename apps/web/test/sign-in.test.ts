import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { browserLang, sessionFromRedeem, SIGN_IN_COPY } from "../shared/sign-in.ts";

test("signed-in pages are English whatever the browser asks", () => {
  assert.equal(browserLang(undefined), "en");
  assert.equal(browserLang("en-US,en;q=0.9"), "en");
  assert.equal(browserLang("ru-RU,ru;q=0.9,en;q=0.8"), "en");
  assert.equal(browserLang("fr-FR,fr;q=0.9"), "en");
  assert.deepEqual(Object.keys(SIGN_IN_COPY), ["en"]);
});

test("a redeem answer opens one session or says why it did not", () => {
  assert.deepEqual(sessionFromRedeem(200, { sessionId: "s", accountId: "a" }), {
    ok: true,
    sessionId: "s",
    accountId: "a",
  });
  assert.deepEqual(sessionFromRedeem(410, { error: "used" }), { ok: false, reason: "used" });
  assert.deepEqual(sessionFromRedeem(410, { error: "expired" }), { ok: false, reason: "expired" });
  assert.deepEqual(sessionFromRedeem(404, { error: "unknown" }), { ok: false, reason: "failed" });
  assert.deepEqual(sessionFromRedeem(200, {}), { ok: false, reason: "failed" });
});
