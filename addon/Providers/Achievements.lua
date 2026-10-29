local _, ns = ...

local function Build(ctx)
  local tasks = {}
  local level = ctx.level or 1
  for i = 1, #ns.Data.FunAchievements do
    local entry = ns.Data.FunAchievements[i]
    if not entry.minLevel or level >= entry.minLevel then
      local state = ns.AchievementState(entry.achievementID)
      if not state or not state.done then
        if state or not GetAchievementInfo then
          tasks[#tasks + 1] = {
            id = entry.id,
            title = (state and state.name) or entry.fallbackTitle,
            mapID = entry.mapID,
            x = entry.x,
            y = entry.y,
            estMinutes = entry.estMinutes or 20,
            priority = entry.estMinutes or 20,
            note = entry.note,
            source = "fun",
            complete = { kind = "achievement", achievementID = entry.achievementID },
          }
        end
      end
    end
  end
  table.sort(tasks, function(a, b)
    if a.estMinutes ~= b.estMinutes then
      return a.estMinutes < b.estMinutes
    end
    return a.id < b.id
  end)
  return tasks
end

ns.RegisterProvider({
  id = "fun",
  Build = Build,
})
