# Player website

Nuxt 4 site in this monorepo ([ADR 0073](../../docs/adr/0073-website-and-account-link.md)). Public pages are English. Paths and collections share one catalog ([ADR 0075](../../docs/adr/0075-collections-are-paths.md)): `/paths/<slug>` and `/collections/<slug>`. There are no pages for a single item, mount or NPC.

Page text and SEO fields live in Postgres (`web.pages`, `content.paths`), not in markdown files. The Server applies the migration. Business rules stay on the Server API.

## Run locally

Start Postgres and the Server once so migrations run, then the site against the same database:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/unbored pnpm --filter @unbored/web dev
```

The dev server listens on port 3001. `NUXT_PUBLIC_SITE_URL` overrides the canonical origin (default `https://unbored.kosarev.space`). `NUXT_SESSION_PASSWORD` (32 characters or more) seals the later sign-in cookie. Do not commit either secret.

`GET /ready` is this process. `GET /health` stays on the Server.

## Routing

The site is its own Dokploy app on the Server's host. [`deploy/traefik.yml`](deploy/traefik.yml) is the route table: `/v1`, `/mcp`, `/health` and `/owner` keep going to the Server, and the site takes the rest, including `/`, `/paths` and `/collections`. Applying it is a manual step. This repo does not deploy it.
