local _, ns = ...

-- The chips Wisp offers when there is no plan. One click sends a plan
-- request: mode for the in-game builder and the server, topic so the
-- planner knows which chip it was, wish in plain words for the planner.
-- label is a locale key. Edit, reorder, or add rows here; nothing else
-- needs to change. topic must be lowercase letters, "_" or "-".
ns.Data.Presets = {
  {
    id = "nearby",
    label = "PRESET_NEARBY",
    mode = "roam",
    wish = "Stay in this zone and do things nearby: rares, treasures, world quests, local events.",
  },
  {
    id = "mount",
    label = "PRESET_MOUNT",
    mode = "farm",
    wish = "Get a mount I don't have yet, the one I have the best chance at.",
  },
  {
    id = "collect",
    label = "PRESET_COLLECT",
    mode = "fun",
    wish = "Collect things in this zone I don't have yet: pets, toys, transmog, achievements.",
  },
  {
    id = "grind",
    label = "PRESET_GRIND",
    mode = "quests",
    wish = "Grind: levels, renown, or reputation, whatever helps this character most.",
  },
  {
    id = "gold",
    label = "PRESET_GOLD",
    mode = "farm",
    wish = "Farm gold or crafting materials.",
  },
  {
    id = "surprise",
    label = "PRESET_SURPRISE",
    mode = "roam",
    wish = "Surprise me with something fun.",
  },
}
