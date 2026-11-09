# 0083. Table and FAQ blocks in guides

Status: accepted (2026-11-09)

## Context

Guide blocks are heading, paragraph, list, link, callout and figure. The queries we target ("best professions for each class", "enhanced or classic", "mount cost", "vs classic") are answered best by a comparison table and short direct answers. Google shows FAQ rich results only for a few authoritative government and health sites since 2023, and HowTo rich results are gone, but the visible answers still match "People also ask".

## Decision

- New block `table`: an optional caption, 2 to 6 columns, 1 to 30 rows, each cell plain text (term markup allowed, no HTML). It renders as a real `<table>` with header cells; on narrow screens it scrolls horizontally inside its frame with the caption visible.
- New block `faq`: 1 to 8 entries `{ q, a }`, plain text, rendered visibly as a list of questions and answers, at most one per guide.
- The page's FAQPage JSON-LD is built only from the visible `faq` block, word for word.
- Both blocks are allowed for Retail and Forever guides and validated with strict zod schemas in `packages/contracts`.

## Alternatives

- Markdown tables inside paragraphs: rejected, unvalidated and hard to render accessibly.
- FAQ as plain headings and paragraphs: works for readers, but loses structure and the matching JSON-LD.
- Skip FAQPage JSON-LD because there is no rich result: rejected; it is cheap and harmless when it mirrors visible text.

## Consequences

Contracts, Server content validation, web blocks and `EntryBody.vue` change; `docs/content-authoring.md` documents the blocks; tests cover limits, rendering and escaping. Writers must not hide content in the FAQ that is not on the page.
