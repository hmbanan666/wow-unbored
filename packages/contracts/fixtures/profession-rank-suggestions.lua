UnboredSuggestions = {
  ["v"] = 1,
  ["computedAt"] = 1000,
  ["characters"] = {
    ["forever/Realm-Hero"] = {
      {
        ["id"] = "profession:197",
        ["kind"] = "profession",
        ["title"] = "Tailoring",
        ["goal"] = "75/75: train the next rank",
        ["rewards"] = {},
        ["profession"] = {
          ["game"] = "forever",
          ["skillLine"] = 197,
          ["from"] = 75,
          ["target"] = 75,
          ["nextCrafts"] = 0,
          ["rankMax"] = 75,
        },
        ["request"] = {
          ["topic"] = "suggestion",
          ["suggestionId"] = "profession:197",
          ["wish"] = "Tailoring",
        },
        ["plan"] = {
          ["v"] = 1,
          ["kind"] = "plan",
          ["mode"] = "custom",
          ["generatedAt"] = 1000,
          ["title"] = "Tailoring",
          ["goal"] = "Train the next rank of Tailoring.",
          ["tasks"] = {
            {
              ["id"] = "rank:197:75",
              ["title"] = "Train the next rank of Tailoring at a trainer",
              ["estMinutes"] = 1,
              ["mapID"] = 37,
              ["x"] = 0.12,
              ["y"] = 0.34,
              ["note"] = "Visit Teacher.",
              ["complete"] = {
                ["kind"] = "profession_rank",
                ["skillLine"] = 197,
                ["previousMax"] = 75,
              },
              ["profession"] = {
                ["kind"] = "rank",
                ["name"] = "Tailoring",
                ["trainer"] = "Teacher",
              },
            },
          },
        },
      },
    },
    ["Realm-Hero"] = {},
  },
}
