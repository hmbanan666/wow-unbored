# 0084. The /forever hub as a topic cluster

Status: accepted (2026-11-09)

## Context

`/forever` is the landing page for "wow forever guides", but it has a short title, an overlong description, little authored text, no images and a mostly flat list of cards. The content plan adds about 25 Forever pages in seven groups: new systems, classes, professions and gold, dungeons and raids, mounts and riding, addons, comparisons and first steps.

## Decision

`/forever` becomes a hub: a title of at most 60 characters naming the main topics, a description of at most 155 characters, a short authored intro (400 to 700 words in total on the page), a "Start here" row (beginner guide, presets, and the FAQ once it exists), key dates with a Blizzard link, one section per group with its guide cards, and "Recently updated". Each guide records its group so the hub and the "More guides" block can use it. Structured data: CollectionPage with ItemList and BreadcrumbList. URLs of guides stay `/guides/<slug>`.

## Alternatives

- Separate hub pages per group (`/forever/classes`, `/forever/professions`): deferred until a group has 5 or more pages; thin hubs rank worse than one strong hub.
- Keep the flat list: rejected, it neither ranks for the hub query nor helps readers find the next page.

## Consequences

Guide versions get a group field validated against a fixed list. The hub needs an update whenever a group gains a page; the editorial skill reminds the writer.

Store `group` as `content.paths.guide_group`, separate from the immutable published JSON body. The shared contract and Server validate the eight values: `first-steps`, `systems`, `classes`, `professions-gold`, `dungeons-raids`, `mounts-riding`, `addons`, `comparisons`. Historical versions and pre-existing drafts may retain null; new Forever drafts require a group, and later group changes use the ordinary draft/publication flow. Retail content has no Forever group.

Migration 0025 assigns metadata only to the nine expected English Forever publications. It locks content writes, checks complete publication fingerprints and versions, aborts on unexpected publications or drafts, and records completion separately so replay preserves later edits. It does not change published bodies, hashes, titles, timestamps, versions or history. Fresh databases remain empty. A column is safer than republishing every article for navigation metadata and makes each subsequent version's group explicit.

Deploy the Server and migration before the web build, because the web queries the new column. The old web ignores it. Update `docs/content-authoring.md` whenever publishing adds a group or changes the hub's promises. The task's 400–700-word hub scope and future FAQ link supersede the general guide length and FAQ requirements in ADR 0081.
