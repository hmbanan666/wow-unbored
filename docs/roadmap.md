# Roadmap: from addon to a personal content platform

Unbored grows from an in-game helper into a personal content platform: a website where a player sees their characters, progress and finished Plans, and picks **Paths** (curated goal collections per content) that drive the Plans Bory gives in game. Public Path pages bring players in from search; the addon and Companion make tracking effortless. Decisions are in ADRs 0071-0074.

| Phase | What ships | Done when |
| --- | --- | --- |
| 0.13 Game DB | Server-side game database from client DB2 tables, refreshed every game build; agent tools read it; `put_plan` checks every id, quest and point against it ([0071](adr/0071-game-db.md)) | A Plan with an unknown id or unverifiable outcome is corrected or rejected; a new build is imported without a deploy |
| 0.14 Paths | Path catalog on the Server (kinds `path` and `collection`, an authored top list such as "Top 50 mounts to get first"), progress per Character from the Game data snapshot, Path completion in Player history, "Continue your Path" Idea and Plans built from the next unfinished Path goals ([0072](adr/0072-paths.md)) | In game, picking a Path Idea gives a Plan whose outcome is a Path goal, and finishing it moves the Path's X / Y |
| 0.15 Website MVP | `apps/web` (Nuxt 4, same Postgres): sign in from the Companion with one click, character page (progress, history of Plans), Paths catalog with my progress, pick a Path ([0073](adr/0073-website-and-account-link.md)) | A player opens "My page" from the Companion, sees their characters and picks a Path that the next in-game Plan uses |
| 0.15 Public Path pages | English, indexable Path pages without player data, built from the same Path data plus written guide text ([0074](adr/0074-public-path-pages.md)) | Path pages are server-rendered, in the sitemap, and link to install |
| Later | Path topics and deeper tiers for more content, Russian pages, Battle.net sign-in for several PCs, paid plan, public profiles (opt-in) | |

Order matters: Paths count progress from verified game ids, so they need the Game DB; the website shows Paths, so it needs them on the Server.
