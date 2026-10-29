local _, ns = ...

-- Bundled Advice for current-expansion items the live rules cannot read
-- (crests, catalysts, knowledge items, event tokens): docs/adr/0019.
-- It ships with addon updates; Personal advice from the Companion wins over it.
--
-- One row per itemID, written as an action, never "delete":
--   [itemID] = { action = "keep", en = "Keep: ...", ru = "Оставь: ..." },
-- action is one of keep, sell, use, bank, send, disenchant, equip, open,
-- turn_in, info (the same list as the put_item_advice MCP tool).
--
-- TODO(owner): fill from the unmatched itemIDs the profiles log
-- (get_player_profile -> unmatchedItems). Only add ids checked in game.
ns.Data.Advice = {}
