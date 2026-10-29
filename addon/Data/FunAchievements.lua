local _, ns = ...

-- Solo achievements that are fun in a sitting, not a grind checklist.
-- estMinutes is a rough session size. The budget filler prefers shorter ones.
-- IDs checked against the public achievement list (Going Down? is 964,
-- Higher Learning 1956, squirrel sets 1206 / 2557 / 5548, Well Read 1244).

ns.Data.FunAchievements = {
  {
    id = "fun-going-down",
    achievementID = 964,
    fallbackTitle = "Going Down?",
    estMinutes = 5,
    note = "Fall 65 yards without dying. Any cliff you trust.",
  },
  {
    id = "fun-higher-learning",
    achievementID = 1956,
    fallbackTitle = "Higher Learning",
    estMinutes = 25,
    mapID = 125,
    note = "The Schools of Arcane Magic, Dalaran. Books rotate; take the ones that are out.",
  },
  {
    id = "fun-squirrels-loved",
    achievementID = 1206,
    fallbackTitle = "To All The Squirrels I've Loved Before",
    estMinutes = 30,
    note = "Use /love on critters. Progress sticks if you run out of time.",
  },
  {
    id = "fun-squirrels-cared",
    achievementID = 5548,
    fallbackTitle = "To All the Squirrels Who Cared for Me",
    estMinutes = 25,
    note = "Cataclysm critters. Same /love, new faces.",
  },
  {
    id = "fun-squirrels-shared",
    achievementID = 2557,
    fallbackTitle = "To All The Squirrels Who Shared My Life",
    estMinutes = 30,
    note = "More critters. Wander, don't rush.",
  },
  {
    id = "fun-well-read",
    achievementID = 1244,
    fallbackTitle = "Well Read",
    estMinutes = 45,
    note = "Books in inns and cities. A long wander; it fits a 1-2 hour sitting.",
  },
}
