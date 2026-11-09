# Editorial review: pass or repair

Apply every dimension to the draft and its [brief](../../guide-write/references/brief.md), which defines the search/evidence records and shape rules under [ADR 0081](../../../../docs/adr/0081-search-led-editorial-standard.md). Failed checks block publication; do not average them into a score. While table/FAQ blocks are pending in the later task planned as ADR 0083, check their complete brief plans and report rendering as pending separately.

| Dimension | Pass evidence | Repair signal |
| --- | --- | --- |
| Query record | One primary query, 3–8 secondary queries with provenance, intent type, dated searches; autocomplete, People also ask and top five results inspected | Invented demand, missing search input, adjacent pages answering the same primary query |
| Promise and opening | Title, description and first two sentences answer the query; opening starts with an in-game NPC, number or place | Generic welcome, a route promise without a route, interchangeable openings |
| Decision | Comparison states a result with deciding mechanics or quantities, tradeoff and next action | "Compare A with B" leaves the work to the reader; ranking letters stand in for reasons |
| Truth | Every fact traces to Game/build-specific evidence in the brief or a newly logged source | Secondary repetition treated as confirmation, beta numbers called live, invented play/testing |
| Interest | Verified specifics survive revision; each section teaches a mechanic, cost or consequence | Useful recipes/NPCs/numbers dropped, abstract versatility, source summaries |
| Table/steps | At least one useful table or numbered sequence, complete with evidence; planned in brief until blocks are supported | Decorative comparison with no result; a promise to add a table without rows or steps |
| FAQ | 4–8 People also ask questions with recorded provenance and sourced answers; planned in brief until supported, then visible in HTML | Invented questions, unanswered questions, hidden or schema-only FAQ |
| Links | Game hub (`/forever` or `/guides`) and 2–3 relevant published sibling pages, with meaningful labels | Dead destinations, wrong Game hub, irrelevant links to meet the count |
| Metadata | Title ≤60 characters with primary query near start; description 120–155; counts include spaces and rendered title suffix | Old relaxed ranges, missing counts, padded text or a misleading promise |
| Length | Scope matches approximate bands: quick answer 600–1,000; system 1,200–2,000; class/hub 2,000–3,500 | Padding to reach a count, repeated conclusions, needed answers cut to meet a band |
| Clarity | Essential advice in prose; unfamiliar terms have short sourced explanations; banned-pattern pass complete | Hover-only prerequisites, unexplained jargon, self-commentary, rhetorical contrasts |
| Uncertainty | Forecast labelled once at its scope; distinct disputed claims retain local qualifications | Same empty hedge per paragraph; uncertainty deleted to sound decisive |
| Images and alt text | Own screenshots only, provenance recorded, accurate meaningful alt text; no image if none available | Wowhead/third-party art, invented visual context, keyword-list alt text, edits beyond compression/format conversion |
| Technical search | Unique metadata, useful headings, stable URL, valid canonical/indexability/sitemap and status | Keyword variants as headings, fake rating schema, HTTP success mistaken for editorial quality |
| Maintenance | New version for edits, actual access dates, source builds and explicit update triggers | Publication date passed off as live testing, date bump without changed content |

## Banned patterns: bad and better

Examples draw on the PR #153 review of migration 0023's first edition. Quoted bad lines are historical examples; the repeated-hedge, filler and padding examples illustrate those failures using the same material. Better lines demonstrate the edit, not a source: reverify their facts in the current brief.

| Pattern | Bad | Better |
| --- | --- | --- |
| Meta about the text | "These examples explain how to read it; they are not guaranteed yields for every item." / "This uncertainty belongs to that gear choice, not to every sentence about Enchanting." | "Enchanted Lute requires 1 Simple Wood and 1 Strange Dust." Keep a real yield or binding uncertainty once beside the affected claim; delete commentary on the article. |
| "Not X, but Y" turns | "Free supplies and uninterrupted progress are different things." / "These are reasons to compare them, not proof..." | "Warlock has no movement-speed tool before the level-40 Felsteed, so fewer drink stops do not automatically mean less travel time." State the mechanic and consequence. |
| Comparison without a result | "Compare Hunter, Paladin and Mage by recovery, safety and control." / "Compare gathering first." | "The Apprentice Textiles crate accepts 40 Linen Cloth or 20 Light Leather. The leather option uses half as many materials; it costs less only when one leather costs less than two cloth." Give the result; without verified prices, keep the price condition explicit. |
| Empty repeated hedges | "Early forecast favors Hunter. Remember that this is an early forecast. Check current data." | Label the forecast once beside the answer, then give the constraint: "Levels 1-9 are petless. The feature behind the recommendation has not arrived yet." |
| Filler intros | "Enchanting offers many possibilities. This guide will help you get started." | "Open the Professions window to find Disenchant." Lead with the in-game action and location. |
| Padding to a word count | "The Apprentice Textiles crate accepts 40 Linen Cloth or 20 Light Leather. There are two options. Choose between cloth and leather." | "The Apprentice Textiles crate accepts 40 Linen Cloth or 20 Light Leather." Stop when the useful fact and decision are clear. |

Treat these as revision failures, not a keyword filter. Keep necessary factual distinctions, such as the location of Disenchant, while removing rhetorical "not X, but Y" scaffolding. Do not replace banned phrases mechanically with synonyms. Use periods, commas or colons instead of em dashes in player copy.

## Keep the specifics

Mark each section's useful fact or decision, then compare with the brief's specifics inventory. Restore supported details lost in editing: Voidwalker holding one mob while Fear removes a second; the Enchanted Lute recipe; Dokimi and Marcy Baker; crate quantities and rewards. For example, "a white crate pays 5 Favor + 2s50c; a green one pays 5s" gives the reader a real reward comparison. Do not turn these examples into claims about profit, fastest leveling or every item without evidence.

Read as a newcomer with no source tabs open, then as an expert looking for an unsupported leap. For each section ask what the reader learned, can now decide, and which source supports it. Remove personal anecdotes, test results, prices or certainty absent from the ledger; reopen research where the answer needs them.

## Rendered search and image audit

Use the publication flow's content validation and HTML audit. Confirm the actual title including any suffix, description, links and visible content match the brief. Once the planned blocks are supported, verify table/steps and all FAQ questions and answers in server HTML; schema alone cannot satisfy them. These checks do not establish a Google position.

For meaningful screenshots, alt text describes what is visibly shown and why it matters here; use verified location/item names only. Decorative images need empty alt text where supported. Reject keyword lists, "image of" and invented context. Alt text is not a reason to add art; without our own screenshot, omit it.
