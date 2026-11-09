# Player website

Nuxt 4 site in this monorepo ([ADR 0073](../../docs/adr/0073-website-and-account-link.md)). Public pages are English. Paths and collections share one catalog ([ADR 0072](../../docs/adr/0072-paths.md)): `/paths/<slug>` and `/collections/<slug>`. There are no pages for a single item, mount or NPC.

Page text and SEO fields live in Postgres (`web.pages`, `content.paths`), not in markdown files. The Server applies the migration. Business rules stay on the Server API.

## Run locally

Start Postgres and the Server once so migrations run, then the site against the same database:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/unbored pnpm --filter @unbored/web dev
```

The dev server listens on port 3001. `NUXT_PUBLIC_SITE_URL` overrides the canonical origin (default `https://unbored.kosarev.space`). `NUXT_APP_SECRET` (32 characters or more) seals the sign-in cookie; `/ready` answers 503 without it. Do not commit either secret.

`GET /ready` is this process. `GET /health` stays on the Server.

## Routing

The site is its own Dokploy app on the Server's host. [`deploy/traefik.yml`](deploy/traefik.yml) is the route table: `/v1`, `/mcp`, `/health` and `/owner` keep going to the Server, and the site takes the rest, including `/`, `/paths` and `/collections`. Applying it is a manual step. This repo does not deploy it.

## Install and downloads (ADRs 0085, 0086)

`/install` is the addon landing page. `/download/windows`, `/download/windows-msi` and `/download/addon` are Nitro 302 redirects to the latest published GitHub release's installer, MSI and addon zip. Unknown names return 404. `/api/downloads` supplies SSR metadata from the same process-local cache: ten minutes, one concurrent GitHub fetch, no token, a three-second timeout. Errors are also cached for ten minutes to avoid retry storms; no stale version or digest is shown. Missing assets or API errors redirect to the latest release page. The redirects use `no-store` and `X-Robots-Tag: noindex, nofollow`, are disallowed by robots and excluded from the sitemap.

Each redirect writes one JSON log line with `event: "download"`, UTC `time`, `asset` (filename, or requested download kind on fallback), `version` (null if unavailable) and `referrer` (a public path on https://playunbored.com, otherwise null). Query strings, fragments, personal paths, IP addresses, user agents and cookies are not logged. These count redirects, not completed downloads. There is no counter table.

The install screenshot is our `Screenshots/plan-card.jpg`. Regenerate its checked-in variants with `node scripts/prepare-install-media.ts`, then format `apps/web/shared/install-media.ts` with `pnpm exec vp fmt`. This calls the existing media conversion pipeline, preserves the full frame and emits content-hashed 320/640 px AVIF and WebP images in `public/media`. `DsGameArt` renders them with CSS contain fitting. The files ship with the website, without a media database row or a volume import. Remove superseded bundled variants when replacing the screenshot. Bory's existing art supplies the share image. No third-party images or SmartScreen screenshot are included.

Copy sources: the README's Install, capabilities and FAQ sections; PRIVACY.md for erasure and local data; the existing Companion addon/plan file paths for uninstall instructions. FAQ topics come from the T4 specification, not claimed search observations. The visible FAQ block is also the sole source of FAQPage answers. No guide publications or database copy are changed.

Deploy only the web build through the usual process. No Server rollout, migration, credentials or new configuration is needed; outbound unauthenticated HTTPS to api.github.com is required for live metadata. The Companion updater feed and release workflows are unchanged. A rollback is the previous web build. No deployment is performed by this task.
