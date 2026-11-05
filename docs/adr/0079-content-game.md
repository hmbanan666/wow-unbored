# 0079. Separate games in site content

Status: accepted

Content has a Game dimension, Retail by default or WoW Forever, stored on each version while guide URLs remain `/guides/<slug>`. WoW Forever accepts only text Guides with sources, build-check notes and callouts; it never uses Retail Game DB validation, media or personal progress. Both games may record guide sources and an explicit checked date/build, while their guide indexes and breadcrumbs stay separate.
