# 0073. Website and account link

Status: accepted

The website (`apps/web`, server-rendered, Nuxt) is served by our Server's host: the site at the root, while `/v1`, `/mcp`, `/health` and `/owner` keep routing to the Server, so installed Companions keep working. Sign-in needs no typing and no password: the Companion's "My page" button asks the Server for a one-time sign-in link (single use, 10 minutes) for its Device and opens the browser; the site sets a session cookie for that Device's Account. More PCs join the same site account the same way; Battle.net sign-in may follow later. The site shows only the player's own data (characters, Sections summary, Plans and Path progress) and lets them pick a Path; Forget my data also ends sessions. The site is free for now; no payments in the MVP. Pages are English and Russian by browser language for signed-in views.
