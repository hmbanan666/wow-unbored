# 0079. Separate games in site content

Status: accepted

Content has a Game dimension, Retail by default or WoW Forever, stored on each version while guide URLs remain `/guides/<slug>`. WoW Forever accepts Guides with text, sources, build-check notes, callouts and own-image heroes or figures only; it never uses Retail Game DB validation, Blizzard references or media sync, items or personal progress, while its page API serves referenced own images with the same CSS cover fitting as Retail. Both games may record guide sources and an explicit checked date/build, while their guide indexes and breadcrumbs stay separate.
