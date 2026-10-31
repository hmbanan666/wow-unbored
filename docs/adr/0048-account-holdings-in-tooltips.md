# 0048. Account holdings in tooltips

Status: accepted

The Server builds an Account holdings index from every Character's bags, bank and reagent bank and the Warband bank, and the Companion writes it into `Advice.lua` inside the Prefetch budget (now 260 KB). A tooltip shows at most two Bory lines: the first action line, then a muted "Also: ..." line naming where else the item is, never this character's own bags, and nothing without data (D142-D147). This amends [0035](0035-personal-only-advice.md) and [0036](0036-prefetch-budget.md).
