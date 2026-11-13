import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import * as signIn from "../shared/sign-in.ts";
import { sessionFromRedeem, SIGN_IN_COPY } from "../shared/sign-in.ts";

test("sign-in lines are English and do not follow a browser language", () => {
  assert.equal(SIGN_IN_COPY.here, "This is your page.");
  assert.equal(SIGN_IN_COPY.missing, "Open My page from the Companion.");
  assert.equal("ru" in SIGN_IN_COPY, false);
  assert.equal("browserLang" in signIn, false);
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
