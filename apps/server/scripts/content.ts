/** Owner content authoring through the running Server (ADR 0072): save a draft, publish it. */
import { readFile } from "node:fs/promises";

const usage = `Usage:
  node apps/server/scripts/content.ts save FILE.json      save or update the draft (ids are checked)
  node apps/server/scripts/content.ts publish KIND SLUG   publish the newest draft (KIND: path, collection or guide)
UNBORED_SERVER_URL and UNBORED_PLANNER_TOKEN must be set.`;

const [command, ...args] = process.argv.slice(2);
const base = process.env.UNBORED_SERVER_URL;
const token = process.env.UNBORED_PLANNER_TOKEN;

async function call(method: string, route: string, body?: string) {
  const response = await fetch(new URL(route, base), {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  const reply = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    console.error(`HTTP ${response.status}: ${String(reply.error ?? "request failed")}`);
    for (const line of (reply.problems as string[] | undefined) ?? []) console.error(`- ${line}`);
    process.exitCode = 1;
  } else console.log(JSON.stringify(reply));
}

if (command === "--help") console.log(usage);
else if (!base || !token) {
  console.error(usage);
  process.exitCode = 2;
} else if (command === "save" && args.length === 1) {
  await call("PUT", "/owner/content", await readFile(args[0], "utf8"));
} else if (command === "publish" && args.length === 2 && /^(path|collection|guide)$/.test(args[0])) {
  await call("POST", `/owner/content/${args[0]}/${encodeURIComponent(args[1])}/publish`);
} else {
  console.error(usage);
  process.exitCode = 2;
}
