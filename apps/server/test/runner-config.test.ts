import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { configFromEnv } from "../src/config.ts";
const tokens = {
  UNBORED_COMPANION_TOKEN: "companion".repeat(5),
  UNBORED_PLANNER_TOKEN: "planner".repeat(6),
};
test("runner configuration defaults to webhook and validates route, token and fallback", () => {
  const defaults = configFromEnv(tokens);
  assert.equal(defaults.plannerRoute, "webhook");
  assert.equal(defaults.runnerToken, undefined);
  assert.equal(defaults.runnerFallbackSeconds, 90);
  const valid = {
    ...tokens,
    UNBORED_PLANNER_ROUTE: "runner",
    UNBORED_RUNNER_TOKEN: "r".repeat(32),
  };
  assert.equal(configFromEnv(valid).plannerRoute, "runner");
  assert.equal(
    configFromEnv({ ...valid, UNBORED_RUNNER_FALLBACK_SECONDS: "30" }).runnerFallbackSeconds,
    30,
  );
  assert.throws(
    () => configFromEnv({ ...tokens, UNBORED_PLANNER_ROUTE: "runner" }),
    /RUNNER_TOKEN/,
  );
  for (const token of ["short", tokens.UNBORED_COMPANION_TOKEN, tokens.UNBORED_PLANNER_TOKEN])
    assert.throws(() => configFromEnv({ ...valid, UNBORED_RUNNER_TOKEN: token }), /RUNNER_TOKEN/);
  assert.throws(() => configFromEnv({ ...valid, UNBORED_PLANNER_ROUTE: "other" }), /PLANNER_ROUTE/);
  for (const seconds of ["-1", "1.5", "NaN", "Infinity"])
    assert.throws(
      () => configFromEnv({ ...valid, UNBORED_RUNNER_FALLBACK_SECONDS: seconds }),
      /FALLBACK_SECONDS/,
    );
});
