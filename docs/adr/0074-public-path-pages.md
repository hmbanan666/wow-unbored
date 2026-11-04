# 0074. Public Path pages

Status: accepted

Every published Path has a public, indexable English page (`/paths/<slug>`) rendered on the server by `apps/web`: what the Path covers, each goal with a short how-to, sources, and a call to install Unbored to track it in game. Articles and Path texts live in Postgres (schema `content`, versioned rows with draft and published states), not in files; they are written and edited through owner tools and reviewed before publishing. Pages carry no player data, have stable slugs, canonical URLs, sitemap entries, structured data and an og-image from `@nuxtjs/seo`. Signed-in players see their own progress on the same page.
