-- Advice (docs/adr/0035, 0021, 0048): at most one "Bory: ..." line for an
-- item, plus the muted holdings line, and only when it is about this player: the active Plan, a quest this character
-- has not done, something new for the Account's collection, Personal advice
-- from the Server, or an Alt who uses the reagent. First match wins.
-- Never says "delete"; never says sell or vendor for an epic or a BoE item.

local _, ns = ...

ns.Advice = {}

-- Trade goods subclass -> profession skill lines that use it.
local REAGENT_SKILLS = {
  [1] = { 202 },
  [4] = { 755 },
  [5] = { 197 },
  [6] = { 165 },
  [7] = { 164, 202, 755 },
  [8] = { 185 },
  [9] = { 171, 773 },
  [12] = { 333 },
  [16] = { 773 },
}
-- Bind types that stay on the account (warbound and account-bound).
local ACCOUNT_BINDS = { [7] = true, [8] = true, [9] = true }
local CLASS_WEAPON, CLASS_ARMOR, CLASS_TRADEGOODS = 2, 4, 7
local UNSAFE = { "delete", "destroy", "удали", "уничтож" }

local function num(value)
  return ns.AsNumber(value)
end

function ns.Advice.ItemInfo(item)
  if not C_Item or not C_Item.GetItemInfo or item == nil then
    return nil
  end
  local r = { pcall(C_Item.GetItemInfo, item) }
  if not r[1] or type(r[2]) ~= "string" then
    return nil
  end
  return {
    name = r[2],
    link = r[3],
    quality = num(r[4]) or 1,
    minLevel = num(r[6]) or 0,
    equipLoc = type(r[10]) == "string" and r[10] or "",
    sellPrice = num(r[12]) or 0,
    classID = num(r[13]),
    subclassID = num(r[14]),
    bindType = num(r[15]) or 0,
    isReagent = r[18] == true,
  }
end

local function T(ctx, key, ...)
  return ns.TL(ctx.lang, key, ...)
end

local function bound(ctx)
  if ctx.bag and type(ctx.slotInfo) == "table" and ctx.slotInfo.isBound ~= nil then
    return ns.Flag(ctx.slotInfo.isBound)
  end
  return ctx.info.bindType == 1
end

-- Bound to this character only: never sent anywhere.
local function soulbound(ctx)
  return bound(ctx) and not ACCOUNT_BINDS[ctx.info.bindType]
end

local function equippable(ctx)
  local info = ctx.info
  return (info.classID == CLASS_ARMOR or info.classID == CLASS_WEAPON)
    and info.equipLoc ~= "" and info.equipLoc ~= "INVTYPE_NON_EQUIP_IGNORE"
end

local function myProfessions()
  local list = ns.Profile and ns.Profile.Professions and ns.Profile.Professions()
  return type(list) == "table" and list or {}
end

local function professionFor(list, skills)
  local best
  for i = 1, #list do
    local row = list[i]
    for j = 1, #skills do
      if type(row) == "table" and num(row.skillLine) == skills[j] then
        if not best or (num(row.skill) or 0) > (num(best.skill) or 0) then
          best = row
        end
      end
    end
  end
  return best
end

local function result(line, action, rule)
  return { line = line, action = action, rule = rule }
end

local function safe(line)
  if type(line) ~= "string" or ns.Trim(line) == "" then
    return nil
  end
  local lower = line:lower()
  for i = 1, #UNSAFE do
    if lower:find(UNSAFE[i], 1, true) then
      return nil
    end
  end
  return ns.Utf8Truncate(ns.Trim(line:match("^[^\n]*") or line), 160)
end

-- Needed for the active Plan: names the Step.
local function planRule(ctx)
  local mountID = C_MountJournal and C_MountJournal.GetMountFromItem
    and num(ns.Call(C_MountJournal.GetMountFromItem, ctx.itemID)) or nil
  ctx.mountID = mountID
  local task = ns.Items and ns.Items.PlanTask(ctx.itemID, mountID)
  if task then
    return result(T(ctx, "ADV_PLAN_STEP", ns.Markup.Plain(task.title or "", task.npcs)), "keep", "plan")
  end
end

local function questDone(questID)
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then
    return ns.Flag(ns.Call(C_QuestLog.IsQuestFlaggedCompleted, questID))
  end
  return false
end

-- Starts a quest this character has not taken and not completed.
local function questStartRule(ctx)
  local quest = ctx.questInfo
  local questID = type(quest) == "table" and num(quest.questID) or nil
  if not questID or ns.Flag(quest.isActive) or questDone(questID) then
    return nil
  end
  local title = C_QuestLog and C_QuestLog.GetTitleForQuestID and ns.Call(C_QuestLog.GetTitleForQuestID, questID)
  if type(title) == "string" and title ~= "" then
    return result(T(ctx, "ADV_STARTS_NAMED", title), "use", "quest")
  end
  return result(T(ctx, "ADV_STARTS_QUEST"), "use", "quest")
end

-- Mounts, toys, pets and looks are collected per Account, so "new" here
-- means no character on the Account has it.
local function newMount(ctx)
  local state = ctx.mountID and ns.MountState(ctx.mountID)
  return state and state.known and not state.collected
end

local function newToy(ctx)
  return C_ToyBox and C_ToyBox.GetToyInfo and num(ns.Call(C_ToyBox.GetToyInfo, ctx.itemID)) ~= nil
    and not ns.ToyOwned(ctx.itemID)
end

local function newPet(ctx)
  if not C_PetJournal or not C_PetJournal.GetPetInfoByItemID or not C_PetJournal.GetNumCollectedInfo then
    return false
  end
  local r = { pcall(C_PetJournal.GetPetInfoByItemID, ctx.itemID) }
  local speciesID = r[1] and num(r[14])
  return speciesID ~= nil and num(ns.Call(C_PetJournal.GetNumCollectedInfo, speciesID)) == 0
end

local function newLook(ctx)
  local api = C_TransmogCollection
  if not equippable(ctx) or not api or not api.GetItemInfo or not api.GetSourceInfo then
    return false
  end
  local _, sourceID = ns.Call(api.GetItemInfo, ctx.link or ctx.itemID)
  sourceID = num(sourceID)
  local source = sourceID and ns.Call(api.GetSourceInfo, sourceID)
  if type(source) ~= "table" or source.isCollected ~= false or not api.PlayerCanCollectSource then
    return false
  end
  local _, canCollect = ns.Call(api.PlayerCanCollectSource, sourceID)
  return ns.Flag(canCollect)
end

local function collectionRule(ctx)
  if newMount(ctx) or newToy(ctx) or newPet(ctx) or newLook(ctx) then
    return result(T(ctx, "ADV_COLLECTION"), "use", "collection")
  end
end

-- Personal advice from the Server, then a planner answer about this item.
local function personalRule(ctx)
  local data = type(UnboredAdvice) == "table" and UnboredAdvice or nil
  local chars = data and type(data.characters) == "table" and data.characters or nil
  local mine = chars and chars[ns.Profile.AltKey(ns.Call(UnitName, "player"), ns.Call(GetRealmName))]
  local entry = type(mine) == "table" and type(mine.items) == "table" and mine.items[ctx.itemID] or nil
  if type(entry) == "table" then
    local line = safe(ctx.lang == "ru" and entry.lineRu or entry.line) or safe(entry.line)
    local action = type(entry.action) == "string" and entry.action or "info"
    local unsafeSell = action == "sell" and (ctx.info.quality >= 4 or not bound(ctx))
    local unsafeSend = action == "send" and soulbound(ctx)
    if line and not unsafeSell and not unsafeSend then
      return result(line, action, "personal")
    end
  end
  local note = ns.Session and ns.Session.ItemNote(ctx.itemID)
  local line = safe(note)
  if line then
    return result(line, "info", "answer")
  end
end

-- The Alt with the best skill in one of these professions.
function ns.Advice.AltFor(skills)
  local alts = ns.Profile and ns.Profile.Alts() or {}
  local bestAlt, bestRow
  for i = 1, #alts do
    local row = professionFor(type(alts[i].professions) == "table" and alts[i].professions or {}, skills)
    if row and (not bestRow or (num(row.skill) or 0) > (num(bestRow.skill) or 0)) then
      bestAlt, bestRow = alts[i], row
    end
  end
  return bestAlt, bestRow
end

local function myKey()
  return tostring(ns.Call(UnitName, "player") or "") .. "-" .. tostring(ns.Call(GetRealmName) or "")
end

-- Where else this item is on the Account (docs/adr/0048), from the Server's
-- holdings index in Advice.lua: { key, name, count, warband } per place,
-- largest first, never this character's own place. Nil without data, with
-- sharing off (D147), or when the index is for another Account.
function ns.Advice.Holdings(itemID)
  itemID = num(itemID)
  local data = type(UnboredAdvice) == "table" and UnboredAdvice.holdings or nil
  if not itemID or type(data) ~= "table" or type(data.places) ~= "table" or type(data.items) ~= "table"
    or (ns.DB and ns.DB.shareData == false) then
    return nil
  end
  local value = data.items[itemID]
  if type(value) ~= "string" then
    return nil
  end
  local me, mine = myKey(), nil
  for i = 1, #data.places do
    if data.places[i] == me then
      mine = i
    end
  end
  if not mine then
    return nil
  end
  local out = {}
  for place, count in value:gmatch("([%dw]+):(%d+)") do
    local index, warband = tonumber(place), place == "w"
    local key = warband and "warband" or index and data.places[index]
    count = tonumber(count)
    if type(key) == "string" and index ~= mine and count and count > 0 then
      out[#out + 1] = {
        key = key,
        name = warband and nil or key:match("^([^-]+)") or key,
        count = count,
        warband = warband,
      }
    end
  end
  table.sort(out, function(a, b)
    return a.count > b.count
  end)
  return #out > 0 and out or nil
end

ns.Advice.HOLDINGS_SHOWN = 3

-- "Also: Grubbyman 40, Warband bank 200, +2" (D142), or nil.
function ns.Advice.HoldingsLine(itemID, lang)
  local list = ns.Advice.Holdings(itemID)
  if not list then
    return nil
  end
  lang = lang or ns.LANG or "en"
  local parts = {}
  for i = 1, math.min(#list, ns.Advice.HOLDINGS_SHOWN) do
    local place = list[i]
    parts[#parts + 1] = (place.warband and ns.TL(lang, "HOLDINGS_WARBAND") or place.name) .. " " .. place.count
  end
  if #list > ns.Advice.HOLDINGS_SHOWN then
    parts[#parts + 1] = ns.TL(lang, "HOLDINGS_MORE", #list - ns.Advice.HOLDINGS_SHOWN)
  end
  return ns.TL(lang, "HOLDINGS_ALSO", table.concat(parts, ", "))
end

-- How many of this item an Alt already has, from the holdings index.
local function altHas(ctx, alt)
  if ctx.held == nil then
    ctx.held = {}
    local list = ns.Advice.Holdings(ctx.itemID) or {}
    for i = 1, #list do
      ctx.held[list[i].key] = list[i].count
    end
  end
  return ctx.held[tostring(alt.name) .. "-" .. tostring(alt.realm)]
end

-- Warband bank for warbound items or when mail cannot reach the Alt.
local function route(ctx, alt)
  if ACCOUNT_BINDS[ctx.info.bindType] then
    return "bank"
  end
  local realm = ns.Call(GetRealmName)
  local faction = ns.PlayerFaction and ns.PlayerFaction()
  if alt.realm == realm and (not alt.faction or alt.faction == faction) then
    return "mail"
  end
  return "bank"
end

-- A reagent for a profession this character lacks and an Alt has (ADR 0021).
local function altRule(ctx)
  local info = ctx.info
  if info.classID ~= CLASS_TRADEGOODS or soulbound(ctx) then
    return nil
  end
  local skills = REAGENT_SKILLS[info.subclassID]
  if not skills or professionFor(myProfessions(), skills) then
    return nil
  end
  local alt, row = ns.Advice.AltFor(skills)
  if not alt then
    return nil
  end
  -- D145: an Alt who uses it and already has a stack goes first.
  local alts = ns.Profile.Alts() or {}
  local best = 0
  for i = 1, #alts do
    local has = altHas(ctx, alts[i]) or 0
    local skill = professionFor(type(alts[i].professions) == "table" and alts[i].professions or {}, skills)
    if skill and has > best then
      alt, row, best = alts[i], skill, has
    end
  end
  local key = route(ctx, alt) == "mail" and "ADV_SEND_MAIL" or "ADV_SEND_BANK"
  local out
  if best > 0 then
    out = result(T(ctx, key .. "_HAS", alt.name, best), "send", "alt")
  else
    out = result(T(ctx, key, alt.name, row.name or "", num(row.skill) or 0), "send", "alt")
  end
  out.to = alt.name
  return out
end

-- Only lines with a personal signal (D75); no line is the default.
ns.Advice.RULES = {
  planRule,
  questStartRule,
  collectionRule,
  personalRule,
  altRule,
}

-- opts: { link, bag, slot, lines = { text, ... }, lang }. Returns nil and
-- "uncached" until the game has the item, or nil and "unmatched" when no
-- rule fits (that itemID is logged for the Planner).
function ns.Advice.For(itemID, opts)
  itemID = num(itemID)
  if not itemID then
    return nil
  end
  opts = type(opts) == "table" and opts or {}
  local info = ns.Advice.ItemInfo(opts.link or itemID)
  if not info then
    return nil, "uncached"
  end
  local ctx = {
    itemID = itemID,
    link = opts.link or info.link,
    bag = num(opts.bag),
    slot = num(opts.slot),
    lines = opts.lines,
    lang = opts.lang or ns.LANG or "en",
    info = info,
  }
  if ctx.bag and ctx.slot and C_Container then
    if C_Container.GetContainerItemInfo then
      ctx.slotInfo = ns.Call(C_Container.GetContainerItemInfo, ctx.bag, ctx.slot)
    end
    if C_Container.GetContainerItemQuestInfo then
      ctx.questInfo = ns.Call(C_Container.GetContainerItemQuestInfo, ctx.bag, ctx.slot)
    end
  end
  for i = 1, #ns.Advice.RULES do
    local ok, found = pcall(ns.Advice.RULES[i], ctx)
    if ok and type(found) == "table" and found.line then
      return found
    end
  end
  if ns.Profile and ns.Profile.NoteUnmatched then
    ns.Profile.NoteUnmatched(itemID)
  end
  return nil, "unmatched"
end
