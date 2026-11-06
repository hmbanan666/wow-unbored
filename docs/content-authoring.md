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

Use a plain readable label in paragraph or list text:

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

Limits: 12 definitions, 20 mentions, 80-character labels/names and 400-character explanations. Keys are lowercase hyphenated words. Each key must be unique and used; each mention must resolve. Terms belong in paragraphs/lists, not titles, headings or callouts. Definitions contain plain text, not HTML or nested markup. Vue escapes text; rendering never executes authored HTML. Item and spell ids do not produce object pages or official external tooltips.

The existing `DsTooltip` handles desktop hover/focus, keyboard activation, Escape, outside dismissal and touch toggling. On a keyboard connected to a touch device, Tab focus also opens it. The server renders explanations plus a visible definition list; before scripts run, the inline label is a link to that definition. Keep essential advice in the sentence so understanding never requires opening a hover box.

Own icons use the same media-store query and `DsGameIcon` as other art. ADR 0077 still applies: no fan-site images, no added crops, cutouts, recoloring or background manipulation. Forever queues no Blizzard media requests. No new images are included in this change.

## Evidence and freshness

`sources` records labels, absolute HTTPS URLs and actual `YYYY-MM-DD` access dates. `asOf.date` means sources were read, not that the author played the build. `asOf.build` can name an exact source build or a bounded announcement scope; its note states material limitations. The page says “Sources checked,” separately from its publication update date.

Reject a brief whose central answer cannot be substantiated. If only a secondary detail is unavailable, omit it or retain its older access date with an explicit scope note. A forecast stays a forecast after a fresh fetch. Do not update publication timestamps just to look current. Rankings are a business objective, not an outcome this process can guarantee.

## Repeatable technical audit

After running the web app against isolated test data:

```sh
pnpm content:check
python3 scripts/audit-guides.py --base-url http://127.0.0.1:3301 --expect-terms
```

The default content check validates the five migration documents as a bundle, including internal guide destinations and unique titles/descriptions. It is a delivery check for migration 0023, not the source of future article revisions. The audit uses public `curl` GETs only. It checks HTTP 200, sitemap inclusion, robots directives, one H1/title/description, correct production canonicals, useful SSR body, internal next steps, Article Game, Forever breadcrumbs, readable definitions and the absence of visible JSON-LD or unrendered term syntax. Override `--canonical-origin` only if the preview intentionally uses another canonical origin.

After deployment, a coordinator can repeat against `https://playunbored.com`. Before deployment, omit `--expect-terms` when auditing the old publication. These checks assess technical eligibility, not crawling, indexing decisions, search demand, competitors or rankings. Read the article and inspect mobile layout separately; the script is not an editorial score.

## Migration 0023 handoff

The five rewrites are embedded JSON documents in `apps/server/migrations/0023_forever_editorial.sql`, delivered through the existing migration runner. The migration replaces only existing English Forever guide publications at the inspected version/title; an empty database gets no sample articles. It preserves the existing beginner hero, leaves other languages/games alone, retires each old row and publishes the next version. All changed timestamps derive from `NOW()` in UTC epoch seconds.

Coordinate application and content rollout: the new Server and web renderer must support `terms` before exposing the new content. The Server normally applies migrations at startup. Bring the compatible web build up first, then start the compatible Server with the ordinary migration runner; no manual SQL write is needed. During the short interval, the new renderer also handles old documents. This PR does not perform that rollout.

The migration locks content writes during its transaction and aborts on an intervening draft, changed version/title, Game mismatch or changed hero. Review the owner's newer content and prepare an adapted migration if that happens; do not remove the guard or discard the draft. Missing target rows are left alone. A revision marker makes replay a no-op even after a later publication. Tests verify history, constraints, replay and transaction rollback.

If reverting content, read the retained version 1 through `get_content`, then save and publish it as a new version through the authorized tools. Publish the previous content before rolling back to a web build that cannot understand terms. Do not delete history or mutate migration records to replay old content.
