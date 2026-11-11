UnboredSuggestions = { v = 1, computedAt = 1000, characters = {
  ['forever/Realm-Hero'] = {{ id = 'profession:197', kind = 'profession', title = 'Tailoring', goal = '50/75: next 25 crafts', rewards = {},
    profession = { game = 'forever', skillLine = 197, from = 50, target = 75, nextCrafts = 25 },
    plan = { v = 1, kind = 'plan', mode = 'custom', generatedAt = 1000, title = 'Tailoring', goal = 'Raise Tailoring to 75.', tasks = {
      { id = 'train:100', title = 'Learn Linen cloth', estMinutes = 1, mapID = 37, x = 0.12, y = 0.34, complete = { kind = 'manual' },
        profession = { kind = 'train', recipe = 'Linen cloth', trainer = 'Teacher' } },
      { id = 'craft:100:50', title = 'Craft Linen cloth', estMinutes = 1, note = '50 to 75: about 25 crafts.', complete = { kind = 'profession', skillLine = 197, minSkill = 75 },
        profession = { kind = 'craft', recipe = 'Linen cloth', from = 50, to = 75, crafts = 25,
          reagents = '50 {item:10}', slow = false } },
    } }, request = { topic = 'suggestion', suggestionId = 'profession:197', wish = 'Tailoring' },
  }},
} }
-- The same Plan is supported for Retail with a catalog for that skill line.
UnboredSuggestions.characters['Realm-Hero'] = {{ id = 'profession:197', kind = 'profession', title = 'Tailoring', goal = '50/75: next 25 crafts', rewards = {},
  profession = { game = 'retail', skillLine = 197, from = 50, target = 75, nextCrafts = 25 },
  plan = UnboredSuggestions.characters['forever/Realm-Hero'][1].plan,
}}
