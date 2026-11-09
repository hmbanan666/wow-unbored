# 0088. Professions and gold guides without copied leveling routes

Status: accepted (2026-11-09)

## Context

"Leatherworking guide", "blacksmithing guide" and "tailoring guide" are among the first autocomplete results for "wow forever". Wowhead and Icy Veins already publish 1 to 300 routes built from game data. We do not have a verified Forever recipe data set (our Game DB imports Retail only, ADR 0071), and copying another site's route breaks the rule against bulk copying.

## Decision

This batch covers what we can verify and others explain least: Merchant's Favor and Waylaid Crates (table of crates, what to put in, where to hand in, rewards, first crate quest), best professions for each class (a table of the classes with a solo pair and a gold pair and why), the revised early gold guide (named NPCs, crate rewards, never buy gold) and an honest FAQ hub for "is WoW Forever ..." questions. Crafting profession guides come later and take the angle "what to make on the way that you will use or sell, and which recipes cost Favor", with skill steps only from the trainer or our own client data.

## Alternatives

- Publish 1 to 300 routes now from secondary sites: rejected, unverified and close to copying.
- Skip professions: rejected, the demand is too large.

## Consequences

The highest-volume crafting queries wait until we have client data or screenshots. The pages we do publish link to each other and to the gold guide.

For T7 and later content tasks, blocked Google People also ask capture uses observed autocomplete, supplied secondary queries and opened top results; record the failed attempt and fallback in the brief and PR without attributing those questions to PAA.
