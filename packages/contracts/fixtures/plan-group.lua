-- Written by Unbored Companion. Read by Unbored_Plan at login or Refresh.
-- Do not edit this by hand; the app replaces the file.
UnboredExternalPlan = {
  ["v"] = 1,
  ["kind"] = "plan",
  ["mode"] = "custom",
  ["generatedAt"] = 1790000000,
  ["title"] = "Cage Hunt",
  ["goal"] = "Hunt the rares for a {item:128025|Rattling Iron Cage}.",
  ["rewards"] = {
    "{item:128025|Rattling Iron Cage}",
  },
  ["contains"] = {
    ["{item:128025|Rattling Iron Cage}"] = {
      "{mount:900001|Test Boar}",
      "{mount:900002|Test Wolf}",
      "{mount:900003|Test Talbuk}",
    },
  },
  ["tasks"] = {
    {
      ["id"] = "cage:fly",
      ["title"] = "Fly to the hunting grounds",
      ["estMinutes"] = 5,
      ["complete"] = {
        ["kind"] = "manual",
      },
    },
    {
      ["id"] = "cage:rare-a",
      ["title"] = "Defeat the first rare",
      ["estMinutes"] = 5,
      ["group"] = "rares",
      ["complete"] = {
        ["kind"] = "quest",
        ["questID"] = 900101,
      },
    },
    {
      ["id"] = "cage:rare-b",
      ["title"] = "Defeat the second rare",
      ["estMinutes"] = 5,
      ["group"] = "rares",
      ["complete"] = {
        ["kind"] = "quest",
        ["questID"] = 900102,
      },
    },
    {
      ["id"] = "cage:rare-c",
      ["title"] = "Defeat the third rare",
      ["estMinutes"] = 5,
      ["group"] = "rares",
      ["complete"] = {
        ["kind"] = "vignette",
        ["vignetteID"] = 900201,
      },
    },
    {
      ["id"] = "cage:open",
      ["title"] = "Open the cage",
      ["estMinutes"] = 2,
      ["complete"] = {
        ["kind"] = "manual",
      },
    },
  },
}
