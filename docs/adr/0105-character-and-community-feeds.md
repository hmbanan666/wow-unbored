# 0105. Character and community feeds

Status: accepted

Following [0102](0102-english-only-public-pages-with-personal-overlay.md), Forever character feeds at `/forever/players/<realm-slug>/<name-slug>` and the newest-first, paginated `/forever/feed` publish recorded level rises, first recorded profession skills, named learned recipes (up to three per UTC day), reputation rises and optional player screenshots only with per-character sharing, off by default; unshared or unknown addresses serve the same indexable “This character has not shared a feed” stub, with no events, screenshots or sitemap entry, and no inferred dungeon visits.
Owner controls load after mount for the signed-in header selection, on the public feed and existing private history; switching sharing off immediately excludes all posts and media from public reads, while private history remains noindex/no-store and Forget my data removes sharing, events and screenshot files and variants.
Screenshots use the existing compression/conversion pipeline in isolated player-media directories with uncached, sharing-checked delivery; owner uploads require sharing and an own-game-image confirmation, and the Companion collects for an explicitly chosen character until it closes, only newly observed screenshots during an uninterrupted enabled interval, with no historical scan or capture in the addon.
