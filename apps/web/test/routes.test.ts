import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vite-plus/test";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const web = path.join(root, "apps/web");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".nuxt" || name === ".output") continue;
    if (statSync(full).isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out;
}

test("public pages are home, paths and collections", () => {
  const pages = path.join(web, "app/pages");
  assert.deepEqual(readdirSync(pages).sort(), ["collections", "index.vue", "my.vue", "paths"]);
  assert.deepEqual(readdirSync(path.join(pages, "paths")), ["[slug].vue"]);
  assert.deepEqual(readdirSync(path.join(pages, "collections")), ["[slug].vue"]);
});

test("player text is not stored as markdown", () => {
  const markdown = files(web).filter((file) => file.endsWith(".md"));
  assert.deepEqual(
    markdown.map((file) => path.relative(web, file)),
    ["README.md"],
  );
});

test("the catalog stores both kinds and no per-object tables", () => {
  const sql = readFileSync(path.join(root, "apps/server/migrations/0007_web_content.sql"), "utf8");
  assert.match(sql, /kind IN \('path', 'collection'\)/);
  assert.equal(/CREATE TABLE content\.(items|mounts|npcs|achievements)\b/.test(sql), false);
});

test("the route table keeps Companion paths on the Server", () => {
  const routes = readFileSync(path.join(web, "deploy/traefik.yml"), "utf8");
  const server = routes.slice(routes.indexOf("unbored-server:"), routes.indexOf("unbored-web:"));
  assert.match(server, /PathPrefix\(`\/v1`\)/);
  assert.match(server, /PathPrefix\(`\/mcp`\)/);
  assert.match(server, /Path\(`\/health`\)/);
  assert.match(server, /PathPrefix\(`\/owner`\)/);
  assert.equal(server.includes("/paths"), false);
  assert.equal(server.includes("/collections"), false);
  assert.match(routes, /unbored-web:[\s\S]*priority:\s*1/);
  assert.match(server, /priority:\s*100/);
  const image = readFileSync(path.join(web, "Dockerfile"), "utf8");
  assert.match(image, /node", "server\/index\.mjs"/);
  assert.equal(image.includes("NUXT_SESSION_PASSWORD="), false);
  assert.equal(image.includes("DATABASE_URL="), false);
});
