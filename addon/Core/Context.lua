-- Snapshot sent with a plan request so the planner can start near the player.
-- Every read is guarded: a missing API or a Midnight secret value leaves the
-- field out instead of breaking Get plan.

local _, ns = ...

local function round(value, places)
  value = ns.AsNumber(value)
  if not value then
    return nil
  end
  local scale = 10 ^ places
  return math.floor(value * scale + 0.5) / scale
end

local function bool(value)
  if value == nil then
    return nil
  end
  return ns.Flag(value)
end

local function knowsSpell(spellID)
  if type(IsPlayerSpell) == "function" then
    return ns.Flag(ns.Call(IsPlayerSpell, spellID))
  end
  return false
end

local function trackedQuests()
  if not C_QuestLog or not C_QuestLog.GetNumQuestWatches or not C_QuestLog.GetQuestIDForQuestWatchIndex then
    return nil
  end
  local count = ns.AsNumber(ns.Call(C_QuestLog.GetNumQuestWatches)) or 0
  local out = {}
  for i = 1, math.min(count, 10) do
    local questID = ns.AsNumber(ns.Call(C_QuestLog.GetQuestIDForQuestWatchIndex, i))
    if questID then
      local title = C_QuestLog.GetTitleForQuestID and ns.SafeString(ns.Call(C_QuestLog.GetTitleForQuestID, questID))
      out[#out + 1] = { questID = questID, title = title }
    end
  end
  if #out == 0 then
    return nil
  end
  return out
end

local function planProgress()
  local state = ns.Session and ns.Session.state
  if type(state) ~= "table" or type(state.tasks) ~= "table" then
    return nil
  end
  local done = #(state.done or {})
  local skipped = #(state.skipped or {})
  local remaining = #state.tasks
  if remaining == 0 and done == 0 and skipped == 0 then
    return nil
  end
  local current = state.tasks[1]
  return {
    title = ns.SafeString(state.note, 240),
    currentId = current and current.id or nil,
    currentTitle = current and ns.SafeString(ns.Markup.Plain(current.title, current.npcs), 240) or nil,
    step = done + skipped + (current and 1 or 0),
    steps = done + skipped + remaining,
    done = done,
    skipped = skipped,
    remaining = remaining,
  }
end

function ns.PlayerContext()
  local ctx = {}
  local mapID, x, y = ns.RawPlayerPosition()
  ctx.mapID = mapID
  ctx.x = round(x, 4)
  ctx.y = round(y, 4)
  ctx.zone = ns.SafeString(ns.Call(GetRealZoneText)) or ns.SafeString(ns.Call(GetZoneText))
    or ns.SafeString(ns.MapName(mapID))
  ctx.subzone = ns.SafeString(ns.Call(GetSubZoneText))
  ctx.level = ns.AsNumber(ns.Call(UnitLevel, "player"))
  ctx.faction = ns.PlayerFaction()
  local className, classFile = ns.Call(UnitClass, "player")
  ctx.class = ns.SafeString(className, 40)
  ctx.classFile = ns.SafeString(classFile, 40)
  local specIndex = ns.AsNumber(ns.Call(GetSpecialization))
  if specIndex then
    local specID, specName = ns.Call(GetSpecializationInfo, specIndex)
    ctx.specID = ns.AsNumber(specID)
    ctx.spec = ns.SafeString(specName, 40)
  end
  local _, equipped = ns.Call(GetAverageItemLevel)
  ctx.ilvl = round(equipped, 1)
  local copper = ns.AsNumber(ns.Call(GetMoney))
  if copper then
    ctx.gold = math.floor(copper / 10000)
  end
  -- 376777 is the Skyriding passive, 404464 the Flight Style: Skyriding toggle.
  ctx.skyriding = knowsSpell(376777) or knowsSpell(404464)
  ctx.canFly = bool(ns.Call(IsFlyableArea))
  local inside, kind = ns.Call(IsInInstance)
  ctx.inInstance = ns.Flag(inside)
  if ctx.inInstance then
    ctx.instanceType = ns.SafeString(kind, 40)
  end
  ctx.hearth = ns.SafeString(ns.Call(GetBindLocation))
  ctx.trackedQuests = trackedQuests()
  ctx.plan = planProgress()
  return ctx
end
