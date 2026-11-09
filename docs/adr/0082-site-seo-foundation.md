# 0082. Site SEO foundation: identity, article dates, navigation, about page

Status: accepted (2026-11-09)

## Context

The live audit (2026-11-09) shows good basics (unique titles and descriptions, canonical, og:image, Twitter card, Article and BreadcrumbList JSON-LD), but: Article has no author, publisher or datePublished; there is no Organization identity; Forever guides highlight "Guides" in the header; the home title repeats the brand ("Unbored for World of Warcraft | Unbored"); `/path/` with a trailing slash returns 200; the OG image is text only; guide bodies do not link to their hub; there is no page that says who writes the site and how facts are checked.

## Decision

- `nuxt.config.ts` sets a schema.org identity: Organization "Unbored", logo `/bory.png`, `sameAs` the Telegram channel and the GitHub repository.
- Article gets `author` and `publisher` = that Organization, `datePublished` from the first published version (the Server returns `publishedAt`), `dateModified` as now, plus `article:published_time` and `article:modified_time` meta.
- No personal author name on the site for now. The owner may add a Person later.
- The header highlights the section of the page's Game: a Forever guide highlights "WoW Forever". Forever guide URLs stay `/guides/<slug>` (ADR 0079).
- A request with a trailing slash gets a 301 to the path without it.
- New `/about`: who makes Unbored, how facts are checked (sources, build, date), how often pages are reviewed, contact via Telegram. Linked from the footer.
- The OG image template shows Bory or the page's own hero image and a WoW Forever badge for Forever pages.
- Guide pages end with "More WoW Forever guides" (or "More guides"): the hub link and three siblings.
- The home page gets a title and description that name what Unbored does.
- The http to https redirect is fixed in the hosting setup, not in the repository.

## Alternatives

- Move Forever guides to `/forever/<slug>` with 301s: rejected for now. The URL folder is a weak signal; the breadcrumb and the hub already group them, and redirects add risk to pages that are a few days old in the index.
- A personal author byline with Nick's name: deferred. It may help trust, but it publishes a personal identity, which is the owner's choice.
- No about page: rejected. Gaming guides compete on trust, and the page costs little.

## Consequences

Search engines get a consistent publisher, real publish dates and a clearer section structure. The Server API adds `publishedAt`. Tests cover the JSON-LD graph and the active nav item.
