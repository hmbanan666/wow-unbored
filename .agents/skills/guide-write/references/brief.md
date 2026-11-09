# Brief and evidence ledger

Fill this before drafting or revising. It is working editorial evidence, not another content store. The rules implement [ADR 0081](../../../../docs/adr/0081-search-led-editorial-standard.md).

## Search research

- **Scope:** Game, reader's starting situation, language/region and actual UTC research date. Choose one intent: quick answer, how-to, decision, comparison or reference.
- **Search log:** record every query/seed actually used, where it was used (Google autocomplete, People also ask or results), access date and result URL or captured text. Distinguish failed access from an empty result. Search snippets identify leads; open sources before treating their claims as facts.
- **Primary query:** exactly one per page. Inspect neighboring guides and record which existing URL owns adjacent queries. Keep an existing page's URL; resolve overlap in the brief before writing.
- **Secondary queries:** 3–8 relevant queries, with origin and observed wording for each. Research all three inputs: autocomplete suggestions, People also ask and the top five organic results for the primary query. No invented autocomplete or question provenance.
- **Top five results:** record rank, URL/title, the answer and useful specifics each supplies, and unanswered questions or weaknesses our page can address. Answer more fully with verified detail; do not copy prose or infer search volume/rankings from this sample.
- **FAQ research:** select 4–8 relevant questions actually observed in People also ask. Log the triggering query, wording and source/access record for each; questions may overlap the secondary-query list. Find factual evidence for each answer separately.
- **Research gate:** the record must support the query, intent and unanswered needs. If autocomplete, People also ask or results cannot be accessed, log the gap and leave research incomplete; do not substitute invented questions or claim the search pass is done.

## Answer and evidence

- **Reader decision:** "I am choosing my first solo character; which tradeoff will I live with?" Give a defensible answer, its strongest alternative and the condition that reverses it.
- **Game scope:** activity, level range, gear/resources and source build/date. Distinguish source data from a live-client check.
- **Evidence ledger:** claim → exact source URL and section → source date/build → actual UTC access date → fact / forecast / editorial inference / unresolved. Read the source body and qualifications; an HTTP 200 is insufficient. Every fact needs a brief source or a newly logged source, including the opening and FAQ answers.
- **Specifics to retain:** list verified NPCs, quantities, recipes, places and mechanics from the research and old draft, with their sources. For example, the PR #153 review highlighted Voidwalker holding one mob while Fear removes a second; Disenchant in the Professions window; Enchanted Lute requiring 1 Simple Wood + 1 Strange Dust; Dokimi and Marcy Baker; a white crate paying 5 Favor + 2s50c and a green one 5s. These are examples to recheck for this Game/build, not a substitute for sources.
- **Uncertainty and exclusions:** label a forecast once at its scope; qualify separate disputed mechanics locally. Record unsupported prices, timings, recipes or outcomes and the evidence needed to add them. Do not delete a verified detail merely to make prose more cautious.

Use official announcements for availability and rules; appropriate client data or a transparent database for mechanics, preserving build and unresolved fields. A community experiment needs method and sample; a simulator needs assumptions. Two sites repeating one datamined table are one evidence chain. Corroborate consequential commercial-guide claims. Never transfer Retail ids, Classic recipes or beta prices into Forever as live facts.

## Shape and interest plan

- **Opening:** write the proposed first two sentences. Start with a concrete in-game fact (NPC, number or place) and answer the primary query within those sentences. Example: "Levels 1-9 are petless. The feature behind the recommendation has not arrived yet." Connect such a fact to the specific query; it is not a universal opening.
- **Metadata:** title at most 60 characters, primary query near the start; description 120–155 characters. Record counts including spaces and inspect the rendered title with any site suffix. Use natural wording and a useful description, without keyword density targets or clarity exceptions to the limits.
- **Body:** outline consequential choices and the next action. Include at least one table or numbered steps: specify headers/rows or the ordered actions and their evidence. Comparisons must state the result and its deciding numbers or mechanics.
- **Visible FAQ:** plan 4–8 researched People also ask questions and concise sourced answers, visible to readers rather than schema-only content.
- **Structured blocks:** author comparisons as `table` and researched questions and answers as one `faq` block using the [publication flow](../../../../docs/content-authoring.md#tables-and-faq). Verify the complete table and FAQ in server HTML, and FAQPage JSON-LD against the visible answers (ADR 0083).
- **Links:** plan the Game's hub (`/forever` or `/guides`) plus 2–3 relevant sibling pages. Record exact published destinations, meaningful labels and why each helps. If destinations are missing, report the gap instead of making dead links.
- **Images:** only our own screenshots, with provenance and accurate alt text describing the visible subject and its relevance. No own screenshot means no image; no Wowhead or other third-party images. Compression or format conversion only, no other image edits. Read the publication flow's media rules before adding one.

Length follows the answer's scope, not a minimum quota:

| Page scope | Approximate words |
| --- | --- |
| Quick answer | 600–1,000 |
| System guide | 1,200–2,000 |
| Class guide or hub | 2,000–3,500 |

Map how-to, decision, comparison and reference intents to the appropriate scope and record why. Never pad to a number or omit a needed answer to fit a band. Review each section for a useful fact or decision, then use the [banned-pattern examples](../../guide-maintain/references/rubric.md).

## Reject or narrow

"Give the cheapest Enchanting route using launch prices" fails without current prices and verified recipe quantities. Narrow to a supported question, preserve the existing URL and remove the misleading route promise. A class forecast cannot establish a measured fastest 1–60 run; retain useful mechanics such as the petless opening without inventing a winner.
