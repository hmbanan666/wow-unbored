-- Written by Unbored Companion. Read by Unbored_Plan at login or Refresh.
-- Do not edit this by hand; the app replaces the file.
UnboredExternalPlan = {
  ["v"] = 1,
  ["kind"] = "plan",
  ["mode"] = "custom",
  ["generatedAt"] = 1767225600,
  ["title"] = "Ashes in one evening",
  ["goal"] = "Clear {zone:109|Netherstorm}'s Tempest Keep for a shot at {mount:183|Ashes of Al'ar}.",
  ["details"] = "You already have {ach:964|Going Down?}.",
  ["rewards"] = {
    "{mount:183|Ashes of Al'ar}",
    "{ach:964|Going Down?}",
  },
  ["tasks"] = {
    {
      ["id"] = "mentor:fall",
      ["title"] = "Fall from a great height",
      ["estMinutes"] = 5,
      ["why"] = "It is a quick {ach:964} on the way",
      ["rewards"] = {
        "{ach:964}",
      },
      ["complete"] = {
        ["achievementID"] = 964,
        ["kind"] = "achievement",
      },
    },
    {
      ["id"] = "mentor:ashes",
      ["title"] = "Defeat Kael'thas in Tempest Keep",
      ["estMinutes"] = 20,
      ["mapID"] = 109,
      ["x"] = 0.739,
      ["y"] = 0.637,
      ["note"] = "Tempest Keep, Kael'thas.",
      ["why"] = "He drops the mount",
      ["condition"] = {
        ["check"] = {
          ["id"] = 70,
          ["kind"] = "level",
        },
        ["text"] = "If you are level 70 or higher",
      },
      ["complete"] = {
        ["kind"] = "mount",
        ["mountID"] = 183,
      },
    },
  },
}
