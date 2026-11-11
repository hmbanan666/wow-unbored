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

test("public pages are home, install, guides, paths and collections", () => {
  const pages = path.join(web, "app/pages");
  assert.deepEqual(readdirSync(pages).sort(), [
    "about.vue",
    "collections",
    "forever.vue",
    "guides",
    "index.vue",
    "install.vue",
    "my",
    "paths",
  ]);
  assert.deepEqual(readdirSync(path.join(pages, "paths")).sort(), ["[slug].vue", "index.vue"]);
  assert.deepEqual(readdirSync(path.join(pages, "guides")).sort(), ["[slug].vue", "index.vue"]);
  assert.deepEqual(readdirSync(path.join(pages, "collections")).sort(), [
    "[slug].vue",
    "index.vue",
  ]);
});

test("player text is not stored as markdown", () => {
  const markdown = files(web).filter((file) => file.endsWith(".md"));
  assert.deepEqual(
    markdown.map((file) => path.relative(web, file)),
    ["README.md"],
  );
});

test("the catalog stores both kinds and no per-object tables", () => {
  const sql = readFileSync(path.join(root, "apps/server/migrations/0008_web_content.sql"), "utf8");
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
  assert.match(
    image,
    /^COPY packages\/contracts\/src\/web-session\.ts packages\/contracts\/src\/web-session\.ts$/m,
  );
  assert.equal(image.includes("NUXT_APP_SECRET="), false);
  assert.equal(image.includes("NUXT_SESSION_PASSWORD="), false);
  assert.equal(image.includes("DATABASE_URL="), false);
});

test("the site is dark only, with no color-mode switch", () => {
  const config = readFileSync(path.join(web, "nuxt.config.ts"), "utf8");
  assert.equal(config.includes("@nuxt/ui"), false);
  assert.equal(/colorMode|color-mode/.test(config.replace(/\/\*\*[\s\S]*?\*\//g, "")), false);
  assert.match(config, /class:\s*"dark"/);
  const vue = files(path.join(web, "app")).filter((file) => file.endsWith(".vue"));
  for (const file of vue) {
    const text = readFileSync(file, "utf8");
    assert.equal(/UColorMode|useColorMode/.test(text), false, path.relative(web, file));
  }
});

test("pages are built from the design system, with no page styles", () => {
  const ds = readdirSync(path.join(web, "app/components/ds")).sort();
  for (const name of [
    "Breadcrumbs",
    "Button",
    "Card",
    "Chip",
    "Container",
    "EmptyState",
    "Footer",
    "Heading",
    "ItemCard",
    "Nav",
    "Section",
  ]) {
    assert.ok(ds.includes(`${name}.vue`), name);
  }
  const pages = files(path.join(web, "app/pages")).concat(path.join(web, "app/error.vue"));
  for (const file of pages) {
    const text = readFileSync(file, "utf8");
    assert.equal(/<style/.test(text), false, path.relative(web, file));
  }
  const doc = readFileSync(path.join(root, "docs/design-system.md"), "utf8");
  for (const name of ds) assert.ok(doc.includes(`Ds${name.replace(".vue", "")}`), name);
});

test("components never resolve components by name inside templates", () => {
  const vue = files(path.join(web, "app")).filter((file) => file.endsWith(".vue"));
  for (const file of vue) {
    const template = readFileSync(file, "utf8").split("<template>")[1] ?? "";
    assert.doesNotMatch(template, /resolveComponent\(/, file);
    assert.doesNotMatch(template, /:is="[^"]*['`](NuxtLink|nuxt-link|Nuxt[A-Z]\w*)['`]/, file);
  }
});

test("ds Card renders a real link when it has a target", () => {
  const card = readFileSync(path.join(web, "app/components/ds/Card.vue"), "utf8");
  assert.match(card, /const NuxtLink = resolveComponent\("NuxtLink"\)/);
  assert.match(card, /:is="to \? NuxtLink : 'div'"/);
});

test("public SSR never fetches a player session or personal Path data", () => {
  const config = readFileSync(path.join(web, "nuxt.config.ts"), "utf8");
  assert.match(config, /loadStrategy:\s*"client-only"/);
  const paths = readFileSync(path.join(web, "app/composables/usePaths.ts"), "utf8");
  assert.match(paths, /onMounted\(/);
  assert.equal(paths.includes("useFetch"), false);
  const my = readFileSync(path.join(web, "app/pages/my/index.vue"), "utf8");
  assert.match(my, /useFetch<Me>\("\/api\/me",\s*\{ server: false \}\)/);
});
