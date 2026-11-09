# 0081. Search-led editorial standard for guides

Status: accepted (2026-11-09)

## Context

The five WoW Forever guides read as cautious and generic: meta sentences about the text itself, many "not X but Y" turns, advice like "compare X with Y" without numbers, and dropped concrete facts (PR #153 review). The goal for the site is organic Google traffic. Search results for WoW Forever are crowded (Wowhead, Icy Veins and many new fan sites), and r/wowforever bans low-effort AI guides. Word count alone does not rank; a page ranks when it answers the query fully and better than the pages already there.

## Decision

The `guide-write` and `guide-maintain` skills add a search step and an interest step:

- Before writing: record the primary query, 3 to 8 secondary queries (Google autocomplete, "People also ask", the top five results) and the search intent (quick answer, how-to, decision, comparison, reference). One page answers one primary query.
- Shape: the answer in the first two sentences; at least one table or numbered steps; a visible FAQ of 4 to 8 questions taken from "People also ask"; links to the hub `/forever` (or `/guides`) and to 2 or 3 sibling pages; a title of at most 60 characters with the primary query near the start; a description of 120 to 155 characters.
- Interest: open with a concrete in-game fact (an NPC, a number, a place); keep the verified specifics; prefer our own screenshots; when there is no own image, no image.
- Banned patterns, each with a bad and better example: sentences about the guide itself, "this is not X, it is Y", empty hedges repeated per paragraph, "compare A with B" without saying the result, filler intros.
- Length follows intent: quick answer about 600 to 1,000 words, system guide 1,200 to 2,000, class guide or hub 2,000 to 3,500. Never pad to a number.
- A fact still needs a source from the brief or a new logged source; forecasts stay labelled once.

## Alternatives

- A fixed minimum word count (for example 2,000 words for every page): rejected, it produces padding, which is exactly the slop we are removing.
- Keyword density targets: rejected, outdated and harmful to readability.
- Leave SEO to code only (tags, schema): rejected, metadata cannot fix a page that does not answer the query.

## Consequences

Every new or revised guide takes a research pass first, so each writing run produces fewer pages but each one is complete. Reviews check the query record, the table, the FAQ and the banned patterns. Existing guides are brought to this standard when they are next touched.
