# Authored Forever chains

No chains are shipped yet. Do not copy third-party quest databases. Derive order from observed accept/turn-in sequences and review the titles against English-client observations. Completed ids verify existence, not ordering or prerequisites.

One `<slug>.json` file per chain, validated by `questChainSchema` in `packages/contracts/src/quests.ts`:

```json
{
  "slug": "an-example-only",
  "title": "Example format (not a real chain)",
  "faction": "Both",
  "zone": "English zone name",
  "status": "draft",
  "steps": [{ "questID": 1, "title": "English quest title" }]
}
```

`faction` is `Alliance`, `Horde` or `Both`. Ordered steps have unique positive quest IDs; max 200. Keep an unverified list `draft`. To publish, set `published` and run `pnpm quests:publish` against the Server database after migrations. The validator makes any definition with an unobserved step draft and reports the missing IDs. It atomically reconciles this entire directory, so removed files disappear too. The command uses only `quest_sightings` and game-scoped `questsDone`; it never fetches outside data. Public reads check the evidence again, so Forget my data can remove the last proof and hide a chain.

Quest pages use the enUS observation title. Until a title is observed, completed-only quests use `Quest <id>` and a stable `quest-<id>` address; later English observations retain that address. No client-table chain inference.
