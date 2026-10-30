-- Quests: every completed quest id (a Packed id set) and the active quest log.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

local MAX_LOG = 60
local MAX_OBJECTIVES = 10

S.Register({
  name = "questsDone",
  v = 1,
  prio = 65,
  events = { "QUEST_TURNED_IN" },
  read = function()
    local api = C_QuestLog
    if not api or not api.GetAllCompletedQuestIDs then
      return nil
    end
    local ids = call(api.GetAllCompletedQuestIDs)
    if type(ids) ~= "table" or #ids == 0 then
      return nil
    end
    S.Yield()
    return { ids = ns.Pack.Encode(ids), count = #ids }
  end,
})

-- True when this character has turned in the quest, from the snapshot.
function S.QuestDone(questID)
  questID = num(questID)
  if not questID then
    return nil
  end
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then
    local done = call(C_QuestLog.IsQuestFlaggedCompleted, questID)
    if done ~= nil then
      return ns.Flag(done)
    end
  end
  local body = S.Body("questsDone")
  if not body or not ns.Pack.IsPacked(body.ids) then
    return nil
  end
  if S.doneCache ~= body.ids then
    S.doneCache, S.doneSet = body.ids, ns.Pack.Set(body.ids)
  end
  return S.doneSet[questID] == true
end

S.Register({
  name = "questLog",
  v = 1,
  prio = 95,
  events = { "QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_REMOVED", "QUEST_WATCH_LIST_CHANGED" },
  read = function()
    local api = C_QuestLog
    if not api or not api.GetNumQuestLogEntries or not api.GetInfo then
      return nil
    end
    local quests = {}
    local count = num(call(api.GetNumQuestLogEntries)) or 0
    for i = 1, count do
      local info = call(api.GetInfo, i)
      local questID = type(info) == "table" and not info.isHeader and num(info.questID) or nil
      if questID and not info.isHidden then
        local entry = {
          questID = questID,
          title = str(info.title, 120),
          level = num(info.level),
          complete = api.IsComplete and ns.Flag(call(api.IsComplete, questID)) or nil,
          tracked = api.GetQuestWatchType and call(api.GetQuestWatchType, questID) ~= nil or nil,
          campaign = num(info.campaignID),
          frequency = num(info.frequency),
        }
        local objectives = api.GetQuestObjectives and call(api.GetQuestObjectives, questID)
        if type(objectives) == "table" and #objectives > 0 then
          entry.objectives = {}
          for j = 1, math.min(#objectives, MAX_OBJECTIVES) do
            local o = objectives[j]
            if type(o) == "table" then
              entry.objectives[#entry.objectives + 1] = {
                text = str(o.text, 120),
                done = ns.Flag(o.finished),
                have = num(o.numFulfilled),
                need = num(o.numRequired),
              }
            end
          end
        end
        quests[#quests + 1] = entry
        if #quests >= MAX_LOG then
          break
        end
      end
    end
    if count == 0 then
      return nil
    end
    return { quests = quests }
  end,
})
