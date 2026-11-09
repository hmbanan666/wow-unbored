# Content authoring

This is the canonical entry point for guide work. The published text is in Postgres, not a directory of articles. Skills guide the human/editorial work; they are not invoked by the web request handler or a background publisher.

## Pick the workflow

- Commission a new guide or create a replacement draft: [guide-write](../.agents/skills/guide-write/SKILL.md), including its brief and evidence ledger.
- Audit an existing page, respond to reader feedback, or refresh after a patch: [guide-maintain](../.agents/skills/guide-maintain/SKILL.md), including its pass/repair rubric and examples.

These folders use portable `SKILL.md` frontmatter and relative references. A tool that discovers repository skills can select them by their descriptions; otherwise open the entry file explicitly. They need no provider-specific runtime or plugin. The publication command points here so an editor follows the skills before saving content.

## Where the content goes

`content.paths` stores each `(kind, slug, locale, version)` with a Game and draft/published/retired state. `body` is JSONB: blocks, optional terms, sources, `asOf`, hero, items and publication bookkeeping. `ContentStore` in `apps/server/src/content.ts` parses documents, validates Retail ids when applicable, hashes drafts and publishes a new version while retiring the old one. `web.pages` stores standalone site copy. Neither the skills nor temporary JSON drafts create a second content store.

Read existing content through the authorized owner `get_content` tool; the public `/api/catalog/guide/<slug>` is also useful for inspection but omits some storage bookkeeping. Check the latest version before editing. Preserve the slug for an existing guide.

1. Complete the appropriate skill and evidence ledger. Keep temporary export/draft JSON outside tracked content. A brief is not a second published article.
2. Validate a draft with `pnpm content:check path/to/draft.json`. This checks a single English guide's structure, source/freshness fields, safe references and basic editorial completeness. Verify that its internal destinations exist in the published catalog; the single-file check cannot know them.
3. Use `node apps/server/scripts/content.ts save path/to/draft.json` or owner `save_content_draft` / `PUT /owner/content` to save an authorized draft. These share `parseContent`; there is no new authentication or write API.
4. Preview on an isolated test database. Read the rendered body, metadata and term definitions. Run the technical audit below.
5. When publication is authorized, use `node apps/server/scripts/content.ts publish guide <slug>` or owner `publish_content` / `POST /owner/content/guide/<slug>/publish`. Runtime epoch seconds set `updated_at` and `published_at`. Store UTC dates even when the editor's machine uses Europe/Kaliningrad.

The content script uses the existing `UNBORED_SERVER_URL` and `UNBORED_PLANNER_TOKEN` environment variables. Never put their values in a brief, command report, migration or commit. The editorial check is local and requires neither.

## Inline explanations

Use a plain readable label in paragraph or list text, table cells or FAQ answers:

```json
{
  "type": "paragraph",
  "text": "Check the {{term:camp|camp}} before leaving."
}
```

In the same guide document, provide the definition and evidence:

```json
{
  "terms": [{
    "key": "camp",
    "name": "Camp",
    "text": "A shared rest stop with profession-crafted features. Sit or craft for at least a minute to gain their benefits.",
    "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live"
  }]
}
```

The referenced URL must also occur in `sources`, with its real access date; `asOf` must identify the evidence date and source build or announcement scope. A definition inherits the document's Game. Supply `kind: "item" | "spell"` and a positive `id` only when that identity has been verified in that Game; these are provenance fields for future structured data, not a lookup request. Omitted kind means a concept. `icon` may be an existing own-media 16-hex hash, verified to depict the term. Missing art leaves a useful name and explanation. Never substitute a Retail id or a similar-looking icon for Forever.

Limits: 12 definitions, 20 mentions, 80-character labels/names and 400-character explanations. Keys are lowercase hyphenated words. Each key must be unique and used; each mention must resolve. Terms belong in paragraphs, lists, table cells and FAQ answers, not titles, headings, callouts, table headers/captions or FAQ questions. Definitions contain plain text, not HTML or nested markup. Vue escapes text; rendering never executes authored HTML. Item and spell ids do not produce object pages or official external tooltips.

The existing `DsTooltip` handles desktop hover/focus, keyboard activation, Escape, outside dismissal and touch toggling. On a keyboard connected to a touch device, Tab focus also opens it. The server renders explanations plus a visible definition list; before scripts run, the inline label is a link to that definition. Keep essential advice in the sentence so understanding never requires opening a hover box.

Own icons use the same media-store query and `DsGameIcon` as other art. ADR 0077 still applies: no fan-site images, no added crops, cutouts, recoloring or background manipulation. Forever queues no Blizzard media requests. No new images are included in this change.

## Tables and FAQ

[ADR 0083](adr/0083-table-and-faq-blocks.md) adds two structured blocks for both Retail and Forever guides. Author comparisons and researched answers as these blocks, then inspect their rendered HTML. Existing documents need no migration.

```json
{
  "type": "table",
  "caption": "Starting choices",
  "columns": ["Choice", "Next action"],
  "rows": [
    ["Rest first", "Visit the {{term:camp|camp}}."],
    ["Continue", "Take the northern road."]
  ]
}
```

`columns` is the header row: 2–6 nonempty strings, each at most 120 characters. `rows` contains 1–30 arrays, each with exactly one cell per column; cells are nonempty strings of at most 2,000 characters. Optional `caption` is nonempty and at most 600 characters. Supply a descriptive caption when it helps identify the comparison. The real HTML table uses column headers with `scope="col"`; its labelled, keyboard-focusable frame scrolls horizontally on small screens while the caption stays visible. The page itself does not scroll sideways.

```json
{
  "type": "faq",
  "entries": [
    { "q": "Where can I rest?", "a": "Visit the {{term:camp|camp}}." },
    { "q": "Which road comes next?", "a": "Take the northern road." }
  ]
}
```

A guide can contain at most one FAQ block, with 1–8 entries. Each entry has exactly `q` (a nonempty question, at most 120 characters) and `a` (a nonempty answer, at most 2,000 characters). The editorial standard asks for 4–8 researched People also ask questions; the schema also permits smaller useful sets. Questions and answers are visible in server HTML under “Questions”, without opening a disclosure or running scripts.

Both block schemas reject unknown fields, HTML, `{}` and `[[ ]]` markup. The only markup allowed is a valid `{{term:key|label}}` mention in a cell or answer, resolved against the guide's sourced `terms`. These mentions share the existing 12-definition and 20-mention limits with paragraphs and lists. Headers, captions and questions are plain text. These examples show structure, not verified game advice; source the real content before publication.

The page emits FAQPage JSON-LD only from its visible FAQ block. Questions and answers match word for word, with term markup reduced to the authored label. Do not add schema-only answers or a second FAQ data source. No FAQ block means no FAQPage.

Deployment order: bring up the compatible web build first, then the compatible Server, then author and publish content using the new blocks. The new web safely renders old documents before the Server changes. This feature adds no migration and changes no guide text, so deployment alone exposes no new blocks. Keep old web instances out of traffic before publishing such documents. Before rolling the web back, publish versions without the new blocks and expire any cached pages that contain them.

## Evidence and freshness

`sources` records labels, absolute HTTPS URLs and actual `YYYY-MM-DD` access dates. `asOf.date` means sources were read, not that the author played the build. `asOf.build` can name an exact source build or a bounded announcement scope; its note states material limitations. The page says “Sources checked,” separately from its publication update date.

Reject a brief whose central answer cannot be substantiated. If only a secondary detail is unavailable, omit it or retain its older access date with an explicit scope note. A forecast stays a forecast after a fresh fetch. Do not update publication timestamps just to look current. Rankings are a business objective, not an outcome this process can guarantee.

## Repeatable technical audit

After running the web app against isolated test data:

```sh
pnpm content:check
python3 scripts/audit-guides.py --base-url http://127.0.0.1:3301 --expect-terms
```

The default content check combines migrations 0023, 0024 and 0026–0028, keeping the later revision of each slug, then validates all seventeen guides together, including internal destinations and unique titles/descriptions. Pass one JSON file to validate a draft, or ordered SQL file arguments to validate another migration bundle. These are delivery checks, not the source of future article revisions. The audit uses public `curl` GETs only, discovers all published Forever slugs from the catalog, and compares authored FAQs, visible questions/answers and FAQPage JSON-LD word for word. It also checks that every authored table appears in server HTML. It checks HTTP 200, sitemap inclusion, robots directives, one H1/title/description, correct production canonicals, useful SSR body, internal next steps, Article Game, Forever breadcrumbs, readable definitions and the absence of visible JSON-LD or unrendered term syntax. Override `--canonical-origin` only if the preview intentionally uses another canonical origin.

After deployment, a coordinator can repeat against `https://playunbored.com`. Before deployment, audit an isolated preview with all migrations applied. Older deployments may fail the new hub checks; omitting `--expect-terms` only disables the guide-definition check. These checks assess technical eligibility, not crawling, indexing decisions, search demand, competitors or rankings. Read the article and inspect mobile layout separately; the script is not an editorial score.

## Migration 0023 handoff

The five rewrites are embedded JSON documents in `apps/server/migrations/0023_forever_editorial.sql`, delivered through the existing migration runner. The migration replaces only existing English Forever guide publications at the inspected version/title; an empty database gets no sample articles. It preserves the existing beginner hero, leaves other languages/games alone, retires each old row and publishes the next version. All changed timestamps derive from `NOW()` in UTC epoch seconds.

Coordinate application and content rollout: the new Server and web renderer must support `terms` before exposing the new content. The Server normally applies migrations at startup. Bring the compatible web build up first, then start the compatible Server with the ordinary migration runner; no manual SQL write is needed. During the short interval, the new renderer also handles old documents. This PR does not perform that rollout.

The migration locks content writes during its transaction and aborts on an intervening draft, changed version/title, Game mismatch or changed hero. Review the owner's newer content and prepare an adapted migration if that happens; do not remove the guard or discard the draft. Missing target rows are left alone. A revision marker makes replay a no-op even after a later publication. Tests verify history, constraints, replay and transaction rollback.

If reverting content, read the retained version 1 through `get_content`, then save and publish it as a new version through the authorized tools. Publish the previous content before rolling back to a web build that cannot understand terms. Do not delete history or mutate migration records to replay old content.

## Migration 0024 handoff

`0024_forever_systems.sql` publishes four new English Forever guides and version 3 of the beginner guide. The beginner change adds exactly four link blocks, retaining all prose, sources, evidence dates and its hero. The new guides have their own sources, freshness scope, tables, FAQ and term definitions. ADR 0084 replaces the initial slug-list grouping with each publication's `group` metadata; unpublished entries produce no cards or empty group.

The batch follows 0023's existing-site policy: databases without any English Forever guide rows stay empty. On an existing site the expected beginner version 2 must match its title, description and full stored body. Any new-slug collision (including a draft or another Game), missing beginner or intervening owner edit aborts the transaction. Do not discard owner work or weaken the guards; prepare a reviewed follow-up migration instead. Locks and a revision marker retained in history protect publication and replay. All new publication timestamps come from runtime `NOW()`.

Deploy web with the Systems group and ADR 0083 table/FAQ support before starting the Server containing this migration. The Server's ordinary startup runner applies it; no manual production SQL is needed. Keep old incompatible web instances out of traffic. This task performs no deployment. Repeat the HTML audit after rollout. To undo the batch, prepare a reviewed follow-up migration that retires the four new publications and restores the previous beginner document as a new published version. Preserve history and migration records; there is no standalone retire action in the owner API. Before reverting to a renderer without tables/FAQ, remove those publications from traffic and expire cached pages.

The [batch brief](audits/2026-11-09-forever-systems-brief.md) records the owner's T5-only search evidence exception: Google PAA was blocked by an unusual-traffic challenge, so observed autocomplete, the task's dated secondary queries and accessible search results/competitor pages supplied the search evidence. This is not a general change to the guide skills.

## Forever topic groups and migration 0025

Every new or revised Forever draft sets `group` to one of `first-steps`, `systems`, `classes`, `professions-gold`, `dungeons-raids`, `mounts-riding`, `addons`, `comparisons`. For example, a camping document uses `"group": "systems"`. Shared zod validation, Server parsing and a database constraint enforce the list; the Server requires a group when saving a changed/new Forever draft or publishing a draft. Historical documents without it remain readable, and an identical legacy save remains a no-op. Retail documents must omit it.

The field is stored in `content.paths.guide_group` per version, outside the published body. A subsequent group change follows the normal save-draft/publish flow. The API returns `group` in the owner document, public guide and catalog card. Same-group publications lead the three "More WoW Forever guides" links, with other Forever guides filling spare places.

When adding a Forever guide, check that `/forever` still reads correctly: its title must describe existing topics, intro and group descriptions must fit the new page, the authored text must remain 400–700 words, and the description must remain 120–155 characters. Empty groups are hidden automatically. The Start here row automatically includes published `wow-forever-beginners-guide`, `wow-forever-enhanced-vs-classic-preset` and, once written, `wow-forever-faq`. Do not create an empty FAQ publication. The last five publication times drive Recently updated; a metadata backfill must not make old guides look freshly revised.

Maintain dates, their source URLs and the checked date together in `apps/web/shared/forever-dates.ts`. Reopen Blizzard's announcement when its schedule changes. The raid date of 9 December is now explicit in the launch article; use that primary source. Do not silently promote a third-party forecast to an official date.

`0025_forever_groups.sql` fills the nine expected English publications: beginner → first-steps; camping, sleeping bag, Legacy talents and presets → systems; leveling and solo class → classes; Enchanting and early gold → professions-gold. It compares each publication's version, title, description and complete JSON-body fingerprint, locks content writes and aborts on missing or unexpected publications, existing metadata or intervening drafts. Its fingerprints are MD5 of PostgreSQL's `body::text`, used for change detection, not security. No body, hash, timestamp or history row is changed. A separate `content.editorial_migrations` marker makes direct replay a no-op even after later edits; fresh databases remain empty. Leave conflicting owner work intact and prepare a reviewed adaptation.

Deploy the **Server first**, so its ordinary startup runner adds the column and applies the guarded migration, then deploy the web build that selects that column. The old web ignores the additive metadata. Retain the column and migration records on rollback; the previous web can read the same database. Rolling back Server code also loses its group requirement, so restore the compatible Server before further Forever publication. No production SQL or deployment is part of this task.

## Professions, gold and FAQ: migration 0026

`0026_forever_money.sql` publishes three English Forever pages at version 1: Merchant's Favor and best professions in `professions-gold`, and `wow-forever-faq` in `first-steps`. It revises early gold from version 2 to 3, preserving that publication's current group. The hub's existing Start here selection picks up the FAQ automatically. The updated topic copy points readers to the new pages; the sitemap discovers them through the published catalog.

The migration runs on an existing English Forever site and leaves empty databases empty. It locks content writes and requires the expected gold version, title, description and full body fingerprint from 0025. Missing gold, a changed publication, a target draft, a missing group or any new-slug collision (including Retail or retired rows) aborts the transaction. Unrelated guides, drafts, other locales and history remain untouched. A separate editorial marker makes replay a no-op after later publications or drafts. Runtime `NOW()` supplies publication timestamps; evidence dates describe actual source access. The gold source date was already 9 November, so the new version records a same-day recheck rather than a fabricated later date.

**Deploy order:** retain the Server/schema from 0025 and the web renderer from ADRs 0080/0083/0084. Deploy this web build's updated topic descriptions, then start the Server containing 0026; its ordinary migration runner publishes the batch. No new API or renderer feature is required. The existing main web already renders the new blocks and automatically selects the FAQ. Keep incompatible older web instances out of traffic. This task performs no deployment or manual production writes. Repeat `scripts/audit-guides.py --expect-terms` after rollout.

If the guard fails, preserve owner changes and prepare a reviewed adaptation. To undo the batch, prepare a follow-up migration that retires the three new publications and republishes the retained gold version 2 as a new version, keeping its group. Preserve history, the group column and migration records; do not delete rows or replay an old migration as a rollback.

The [batch brief](audits/2026-11-09-forever-money-brief.md) records sources, advice, disputes and the blocked-PAA attempt. The owner made that fallback permanent for T7 and later tasks in ADR 0088: use observed autocomplete, supplied secondary queries and opened top results, record the failure in the brief and PR, and never attribute those questions to People also ask. The guide-write brief reference is the authoritative procedure.

## Migration 0027 handoff

`0027_forever_raids_comparison_addons.sql` publishes `wow-forever-raids`, `wow-forever-vs-classic` and `best-wow-forever-addons` at version 1, in `dungeons-raids`, `comparisons` and `addons`. It also publishes FAQ version 2 with one link beside its existing raid paragraph. All other FAQ blocks, terms, sources and evidence dates remain unchanged. [ADR 0092](adr/0092-time-sensitive-facts.md) governs the new time-sensitive claims and maintenance dates; [the research brief](audits/2026-11-09-forever-batch-three-brief.md) records actual search provenance, source access and exclusions.

The migration follows 0024–0026: an empty English Forever catalog stays empty; new-slug collisions, a missing/changed FAQ publication, a target draft or a missing FAQ group abort the transaction. The FAQ guard compares its full stored body, title, description, Game and version. Its current group is carried forward. The transaction locks content writes and records a separate editorial marker, so replay preserves later publications and drafts. Unrelated guides, other locales, historical versions and drafts are untouched. Publication timestamps use runtime `NOW()`.

Server runtime, API and schema are unchanged. The Server delivers the migration and the bundle validator includes it. The catalog-driven hub and sitemap discover the new publications; hub topic copy now names their coverage. Migration 0025 and the terms/table/FAQ/group-compatible renderer from main must already be installed. Deploy the updated web build first, then start the Server containing 0027 with its normal migration runner. No manual production SQL is needed. Repeat `scripts/audit-guides.py --expect-terms` after rollout. This task performs no deployment.

If a guard fails, preserve the owner's work and prepare a reviewed adaptation. Rollback needs a follow-up content migration that retires the three new guides and republishes retained FAQ version 1 as a new version with its group. Preserve all history and migration records; do not remove the marker or replay an edited migration. The mount/riding-cost page is not part of this batch.

## Solo class guides: migration 0028

`0028_forever_classes.sql` publishes `wow-forever-warlock-leveling-guide` and `wow-forever-hunter-pet-guide` at version 1 in `classes`, and revises `best-leveling-class-wow-forever` and `best-solo-class-wow-forever` from version 2 to 3, retaining each publication's current group. [ADR 0093](adr/0093-class-guides-scope.md) sets the class scope; the [research brief](audits/2026-11-09-forever-classes-brief.md) records the query fallback, build differences and evidence. The hub and sitemap discover all four through the existing published catalog. The Classes introduction now names the practical guides.

The Server delivers the migration; its runtime, API and schema are unchanged. The batch locks content writes, rejects any existing English row at a new slug, and requires both expected tier-list publications by Game, version, title, description and complete stored body, with a group and no draft. A missing or edited target aborts the whole transaction, including earlier inserts. Historical bodies, unrelated pages, other locales and drafts remain untouched. Empty English Forever catalogs stay empty. A separate editorial marker makes direct replay a no-op, including after later publications or drafts. Runtime `NOW()` supplies publication timestamps. The source-check dates were already November 9 for the old tier lists: the new versions record an honest same-day recheck and the newly read tuning notes.

Deploy the updated **web first**, then start the **Server containing 0028** with its ordinary migration runner. Schema 0025 and the main terms/table/FAQ/group renderer must already be present. No manual production SQL is needed. Repeat `scripts/audit-guides.py --expect-terms` after rollout. This task performs no deployment. Recheck the class pages on November 10 against Blizzard's announced pet/Affliction tuning; do not mark planned changes live without confirmation.

If a guard fails, preserve owner work and prepare a reviewed adaptation. Rollback requires a follow-up content migration retiring the two new publications and republishing the retained tier-list version 2 documents as new versions with their groups. Preserve history and migration records; do not delete the marker or replay an edited migration.
