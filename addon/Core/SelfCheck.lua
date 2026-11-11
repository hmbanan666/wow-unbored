-- One-click probes. This registry is the index for in-game verification TODOs.
-- A successful call verifies availability/shape, not timing or visual behaviour.
local _, ns = ...
local SC = {}
ns.SelfCheck = SC

local probeFrame, probeGroup, probeAnimation, probeLabel
local function animation(method)
  if not probeFrame then
    probeFrame = CreateFrame("Frame")
    probeFrame:Hide()
    probeLabel = probeFrame:CreateFontString(nil, "OVERLAY")
    probeGroup = probeFrame:CreateAnimationGroup()
    probeGroup:SetLooping("REPEAT")
    probeAnimation = probeGroup:CreateAnimation("Alpha")
    probeAnimation:SetDuration(1)
  end
  if method == "Finish" then
    return probeGroup.Finish, { probeGroup }
  end
  return probeAnimation.SetTarget, { probeAnimation, probeLabel }
end

-- Use an already collected own-character chain when available. Zero is an
-- explicit empty-id availability probe, not evidence about chain/chapter data.
local function chainArgument(campaign)
  local body = ns.Snapshot and ns.Snapshot.Body("questLines")
  local lines = type(body) == "table" and body.lines
  for _, line in ipairs(type(lines) == "table" and lines or {}) do
    if type(line) == "table" and (not campaign or ns.AsNumber(line.campaignID)) then
      local id = ns.AsNumber(line.questLineID)
      if id then return { id } end
    end
  end
  return { 0 }
end

-- Criterion 1 exists only on an achievement that has criteria: "Level 10" (6)
-- has none and raises. Eastern Kingdoms Explorer (42) lists every zone.
-- Fixed public ids are only arguments, never player identifiers. No request,
-- filter setter, chat function, tooltip or game window is driven by a probe.
-- Add a row here and point the corresponding verification TODO at this file.
SC.checks = {
  { api = "C_ToyBox.GetToyLink", args = { 54438 } },
  { api = "C_PetJournal.GetPetInfoBySpeciesID", args = { 39 } },
  { api = "C_PetJournal.GetNumCollectedInfo", args = { 39 } },
  { api = "C_PetJournal.GetOwnedPetIDs" },
  { api = "C_WeeklyRewards.GetActivities" },
  { api = "C_PlayerInfo.GetPlayerMythicPlusRatingSummary", args = { "player" } },
  { api = "C_MajorFactions.HasMaximumRenown", args = { 2507 } },
  { api = "C_Reputation.IsFactionParagon", args = { 2165 } },
  { api = "C_QuestLine.GetQuestLineQuests", args = function() return chainArgument(false) end,
    note = "saved chain or empty-id probe; chain order is manual" },
  { api = "C_CampaignInfo.GetCampaignChapterInfo", args = function() return chainArgument(true) end,
    note = "saved chapter or empty-id probe; chapter mapping is manual" },
  { api = "GetAchievementNumCriteria", args = { 42 }, note = "full staged-pass duration is manual" },
  { api = "GetAchievementCriteriaInfo", args = { 42, 1 } },
  { api = "C_ToyBox.GetCollectedShown" },
  { api = "C_ToyBox.GetUncollectedShown" },
  { api = "C_ToyBox.GetUnusableShown" },
  {
    api = "debugstack",
    prepare = function()
      local co = coroutine.create(function() error("self-check") end)
      coroutine.resume(co)
      return rawget(_G, "debugstack"), { co, 1, 8, 0 }
    end,
    note = "dead coroutine; frame contents require manual verification",
  },
  { api = "AnimationGroup.Finish", prepare = function() return animation("Finish") end,
    note = "isolated idle REPEAT group; end-of-loop behaviour is manual" },
  { api = "Animation.SetTarget", prepare = function() return animation("SetTarget") end,
    note = "isolated child font string; visual behaviour is manual" },
  { api = "EncounterJournal_OpenJournal", manual = "opens game UI" },
  { api = "C_MythicPlus.RequestMapInfo", manual = "asynchronous request ordering" },
  { api = "C_Reputation.ExpandAllFactionHeaders", manual = "changes player headers" },
  { api = "C_Reputation.CollapseFactionHeader", manual = "changes player headers" },
  { api = "C_CurrencyInfo.ExpandCurrencyList", manual = "changes player headers" },
  { api = "C_PetJournal.SetFilterChecked", manual = "changes player filters" },
  { api = "C_ToyBox.SetCollectedShown", manual = "changes player filters" },
  { api = "ChatFrame_DisplayTimePlayed", manual = "chat output and taint" },
  { api = "ChatFrameUtil.DisplayTimePlayed", manual = "chat output and taint" },
  { api = "C_Calendar.OpenCalendar", manual = "asynchronous event delivery" },
  { api = "C_Calendar.GetDayEvent", manual = "holiday event-id meaning; calendar may include other players" },
}

-- Never export arbitrary dictionary keys (which can be names or pet GUIDs).
-- Only these known API field names can appear; values are always types only.
local fields = {}
for key in ("type index threshold progress level id name speciesID creatureID icon "
  .. "currentSeasonScore runs challengeModeID mapScore bestRunLevel bestRunDurationMS finishedSuccess "
  .. "questID questLineID campaignID chapterID eventID calendarType iconTexture"):gmatch("%S+") do
  fields[key] = true
end
local function secret(value)
  return type(issecretvalue) == "function" and issecretvalue(value)
end

local function shape(value, child)
  if secret(value) then return "omitted" end
  if type(value) ~= "table" then return type(value) end
  local count, visited, keys = 0, 0, {}
  local first
  for key, item in pairs(value) do
    visited = visited + 1
    if not secret(key) and not secret(item) then
      count = count + 1
      if type(key) == "string" and fields[key] then
        keys[#keys + 1] = key .. ":" .. type(item)
      end
      if key == 1 then first = item end
    end
    if visited >= 64 then break end
  end
  table.sort(keys)
  local out = "table count=" .. count .. (visited >= 64 and "+" or "")
  if #keys > 0 then out = out .. " keys=" .. table.concat(keys, ",", 1, math.min(#keys, 4)) end
  if not child and first ~= nil then out = out .. " first={" .. shape(first, true) .. "}" end
  return out
end

local function resolve(path)
  local value = _G
  for part in path:gmatch("[^.]+") do
    if type(value) ~= "table" then return nil end
    value = value[part]
  end
  return value
end

local function results(...)
  local out = {}
  for i = 1, math.min(select("#", ...), 8) do
    local value = select(i, ...)
    out[#out + 1] = shape(value)
  end
  return "returns=" .. select("#", ...) .. " " .. table.concat(out, "; ")
end

local function probe(check)
  local fn, args
  if check.prepare then fn, args = check.prepare() else fn, args = resolve(check.api), check.args end
  if type(fn) ~= "function" then return false, "missing" end
  if type(args) == "function" then args = args() end
  -- The outer pcall contains both the API and the secret-safe shape reader.
  return true, results(fn(unpack(args or {})))
end

function SC.Run()
  if ns.IsCombat() then return nil end
  local build = "unknown"
  local fn = rawget(_G, "GetBuildInfo")
  if type(fn) == "function" then
    local ok, version, number = pcall(fn)
    if ok and not secret(version) and not secret(number) and type(version) == "string"
      and type(number) == "string" and version:match("^[%d.]+$") and number:match("^%d+$") then
      build = version:sub(1, 20) .. "/" .. number:sub(1, 20)
    end
  end
  local report = { game = ns.Game, ok = 0, failed = 0, manual = 0 }
  local lines = {}
  -- Reserve room for every API, even if an earlier return has a large shape.
  local lineLimit = math.min(256, math.floor(8000 / #SC.checks) - 1)
  for _, check in ipairs(SC.checks) do
    local line = check.api
    if ns.Game == "forever" and (check.api:match("^C_ToyBox%.") or check.api:match("^C_PetJournal%.")) then
      line = line .. " skipped: retail"
    elseif check.manual then
      report.manual = report.manual + 1
      line = line .. " manual: " .. check.manual
    else
      local called, ok, summary = pcall(probe, check)
      if called and ok then
        report.ok = report.ok + 1
        line = line .. " ok " .. summary
      else
        report.failed = report.failed + 1
        -- Exception strings can contain player data, so only the category travels.
        line = line .. " error " .. (called and "missing" or "call-or-shape")
      end
      if check.note then line = line .. " (" .. check.note .. ")" end
    end
    lines[#lines + 1] = line:sub(1, lineLimit)
  end
  local summary = string.format("Self-check game=%s build=%s: %d ok, %d failed, %d manual",
    ns.Game, build, report.ok, report.failed, report.manual)
  ns.RecordSelfCheck(summary, table.concat(lines, "\n"))
  return report
end
