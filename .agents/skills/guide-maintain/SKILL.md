---
name: guide-maintain
description: Audit, rewrite or refresh an existing Unbored guide, including source drift, reader usefulness, inline explanations and technical search metadata. Use after patches, source changes, reader feedback or a scheduled editorial review.
---

1. Read [the publication flow](../../../docs/content-authoring.md). Export/read the published document, metadata and rendered HTML; compare neighboring guides. Record its URL, version and sources before editing.
2. Classify defects with the [rubric and examples](references/rubric.md): wrong promise, missing decision, unsupported claim, repetition, unclear concept, stale evidence or rendering/indexability defect. Show one representative before/after change; do not merely count words or keywords.
3. Reopen sources for claims affected by the update. Use the [evidence ledger](../guide-write/references/brief.md) when a section needs new research. Preserve old accessed dates for inaccessible evidence, disclose the gap, and remove or narrow claims that cannot safely stand. Record changed facts separately from changed advice.
4. Rewrite around the reader's question. Keep useful caveats once at their scope; preserve specific uncertainty on disputed mechanics. Give comparisons consequences: what would this reader do differently? Maintain existing URLs and intent boundaries; revise titles/descriptions to match the delivered answer.
5. Run content validation and the repeatable HTML audit in the publication flow. Check term links with keyboard, touch and scripts disabled; inspect heading order, mobile overflow and readable body text. An HTTP success, a passing schema and a good article are separate checks.
6. Save a new database version through the authorized flow. Use runtime UTC publication timestamps only for substantive edits; record evidence checks honestly. Deliver a concise change rationale, remaining gaps, validation and rollback notes. Done means every rubric dimension passes, or the draft remains unpublished with explicit blockers. Never claim a search position from these checks.
