# Forever recipe evidence

Source: [wago.tools client CSVs](https://wago.tools/db2/SkillLineAbility/csv?build=1.60.1.70888&locale=enUS), build `1.60.1.70888`, enUS, fetched 2026-11-11; all nine table endpoints use this build/locale.

Observed, unconfirmed: AcquireMethod 0 occurs in all 20 item-linked examples and all 13 unlinked examples at trainer-like skill steps. It does not distinguish those groups. The twenty item links are positive client evidence; absence of a teaching item and a multiple-of-five rank do not prove trainer availability. T3 assigns no source kind.

| Spell | Name | Min skill | AcquireMethod | Teaching items |
| --- | --- | --- | --- | --- |
| 2158 | Fine Leather Boots | 1 | 0 | 2406 |
| 2163 | White Leather Jerkin | 1 | 0 | 2407 |
| 2164 | Fine Leather Gloves | 1 | 0 | 2408 |
| 2169 | Dark Leather Tunic | 1 | 0 | 2409 |
| 2334 | Elixir of Minor Fortitude | 50 | 0 | 2554 |
| 2335 | Swiftness Potion | 60 | 0 | 2555 |
| 2542 | Goretusk Liver Pie | 1 | 0 | 2697 |
| 2543 | Westfall Stew | 1 | 0 | 728 |
| 2545 | Cooked Crab Claw | 1 | 0 | 2698 |
| 2547 | Redridge Goulash | 1 | 0 | 2699 |
| 2548 | Succulent Pork Ribs | 1 | 0 | 2700 |
| 2549 | Seasoned Wolf Kabob | 1 | 0 | 2701 |
| 2667 | Runed Copper Breastplate | 90 | 0 | 2881 |
| 2795 | Beer Basted Boar Ribs | 1 | 0 | 2889 |
| 3172 | Minor Magic Resistance Potion | 1 | 0 | 3393 |
| 3174 | Potion of Poison Cleansing | 1 | 3 | 3394 |
| 2333 | Elixir of Lesser Agility | 1 | 0 | 3396 |
| 3188 | Elixir of Ogre Strength | 1 | 0 | 6211 |
| 3230 | Elixir of Minor Agility | 1 | 0 | 2553 |
| 3295 | Deadly Bronze Poniard | 1 | 0 | 2883 |
| 2332 | Minor Rejuvenation Potion | 40 | 0 | None in client links |
| 2662 | Copper Chain Pants | 40 | 0 | None in client links |
| 2665 | Coarse Sharpening Stone | 75 | 0 | None in client links |
| 2666 | Runed Copper Belt | 80 | 0 | None in client links |
| 2668 | Rough Bronze Leggings | 95 | 0 | None in client links |
| 2670 | Rough Bronze Cuirass | 105 | 0 | None in client links |
| 2672 | Patterned Bronze Bracers | 120 | 0 | None in client links |
| 2674 | Heavy Sharpening Stone | 125 | 0 | None in client links |
| 2675 | Shining Silver Breastplate | 135 | 0 | None in client links |
| 2740 | Bronze Mace | 75 | 0 | None in client links |
| 2741 | Bronze Axe | 85 | 0 | None in client links |
| 2739 | Copper Shortsword | 40 | 0 | None in client links |
| 2742 | Bronze Shortsword | 95 | 0 | None in client links |

Full eligible ability rows: 2,541 (one duplicate profession/spell pair); item-linked raw values: 0 = 1828, 3 = 2. Links require the teaching item to exist in ItemSparse. No mapping is promoted to a source classification.

Teaching links: ItemXItemEffect.ItemEffectID -> ItemEffect.ID; TriggerType 6 directly teaches ItemEffect.SpellID, or ItemEffect.SpellID -> SpellEffect.SpellID with Effect 36 teaches EffectTriggerSpell. All referenced items must exist in ItemSparse.

## Full local import

The production import path was run locally against the downloaded CSVs (SQLite).

| Source table | Rows |
| --- | ---: |
| SkillLine | 154 |
| SkillLineAbility | 7,853 |
| SpellReagents | 3,319 |
| ItemSparse | 19,325 |
| ItemEffect | 12,693 |
| ItemXItemEffect | 12,679 |
| SpellEffect | 43,508 |
| TradeSkillCategory | 216 |
| SpellName | 32,482 |
| Total | 132,229 |

| Profession | Skill line | Catalog rows |
| --- | ---: | ---: |
| First Aid | 129 | 32 |
| Blacksmithing | 164 | 513 |
| Leatherworking | 165 | 605 |
| Alchemy | 171 | 204 |
| Herbalism | 182 | 4 |
| Cooking | 185 | 132 |
| Mining | 186 | 17 |
| Tailoring | 197 | 478 |
| Engineering | 202 | 284 |
| Enchanting | 333 | 264 |
| Fishing | 356 | 3 |
| Skinning | 393 | 4 |
| Total | | 2,540 |

41 ability spells have no SpellName entry; they are retained with null names,
not silently removed from totals. There is one duplicated Blacksmithing
profession/spell pair; the lower ability ID wins. Catalog membership is client
evidence, not proof that every listed recipe is currently obtainable.
