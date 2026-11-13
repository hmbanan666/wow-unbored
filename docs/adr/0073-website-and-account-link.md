# 0073. Website and account link

Status: accepted

The website is `apps/web` in this monorepo: Nuxt 4 with Vue, server-rendered, built with pnpm and the repo's Vite+ toolchain for lint, format and test, using maintained Nuxt modules rather than custom code: `nuxt-auth-utils` for sessions, `@nuxtjs/seo` (sitemap, robots, schema.org, og-image) and Nuxt UI. It reads the same Postgres as the Server (own schemas, no copy of player data) and calls the Server's API for anything with business rules. It is a separate Dokploy app on the Server's host: the site at the root, while `/v1`, `/mcp`, `/health` and `/owner` keep routing to the Server, so installed Companions keep working.

Sign-in needs no typing and no password: the Companion's "My page" button asks the Server for a one-time sign-in link (single use, 10 minutes) for its Device and opens the browser; the site starts a sealed session for that Device's Account. More PCs join the same site account the same way; Battle.net sign-in may follow later. The site shows only the player's own data (characters, progress, Plans, Path progress) and lets them pick a Path; Forget my data also ends sessions. Free for now, no payments in the MVP. Signed-in views follow the browser language (English or Russian). Amended by [0102](0102-english-only-public-pages-with-personal-overlay.md): the site is English only.
