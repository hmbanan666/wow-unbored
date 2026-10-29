-- Advice (docs/adr/0019, 0021): one "Wisp: <action>" line for an item, two
-- when a quest has a place. First match wins. Sources: rules on live game
-- APIs, Personal advice from the Companion (UnboredAdvice, read at load),
-- the bundled table (ns.Data.Advice), and the account's Alts for routing.
-- Never says "delete"; never says sell or vendor for an epic or a BoE item.

local _, ns = ...

ns.Advice = {}

local QUEST_SCAN = 60
-- Gear slots by equip location. Weapons are left out: whether a weapon fits
-- the spec is not something these APIs say.
local SLOTS = {
  INVTYPE_HEAD = { 1 },
  INVTYPE_NECK = { 2 },
  INVTYPE_SHOULDER = { 3 },
  INVTYPE_CHEST = { 5 },
  INVTYPE_ROBE = { 5 },
  INVTYPE_WAIST = { 6 },
  INVTYPE_LEGS = { 7 },
  INVTYPE_FEET = { 8 },
  INVTYPE_WRIST = { 9 },
  INVTYPE_HAND = { 10 },
  INVTYPE_FINGER = { 11, 12 },
  INVTYPE_TRINKET = { 13, 14 },
  INVTYPE_CLOAK = { 15 },
  INVTYPE_HOLDABLE = { 17 },
  INVTYPE_SHIELD = { 17 },
}
-- Armour subclass a class wears: 1 cloth, 2 leather, 3 mail, 4 plate.
local ARMOR = {
  MAGE = 1, PRIEST = 1, WARLOCK = 1,
  ROGUE = 2, DRUID = 2, MONK = 2, DEMONHUNTER = 2,
  HUNTER = 3, SHAMAN = 3, EVOKER = 3,
  WARRIOR = 4, PALADIN = 4, DEATHKNIGHT = 4,
}
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
local ENCHANTING = 333
-- Bind types that stay on the account (warbound and account-bound).
local ACCOUNT_BINDS = { [7] = true, [8] = true, [9] = true }
local CLASS_WEAPON, CLASS_ARMOR, CLASS_CONSUMABLE, CLASS_TRADEGOODS, CLASS_QUEST = 2, 4, 0, 7, 12
local POTIONS = { [1] = true, [2] = true, [3] = true }
local FOOD = 5
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

function ns.Advice.Money(copper)
  copper = math.floor(num(copper) or 0)
  if type(GetCoinTextureString) == "function" then
    local ok, text = pcall(GetCoinTextureString, copper)
    if ok and type(text) == "string" and text ~= "" then
      return text
    end
  end
  local gold, silver = math.floor(copper / 10000), math.floor(copper / 100) % 100
  if gold > 0 then
    return string.format("%dg %ds", gold, silver)
  end
  return string.format("%ds %dc", silver, copper % 100)
end

-- Auction price only from Auctionator or TSM, when installed.
function ns.Advice.AuctionPrice(itemID)
  local api = type(Auctionator) == "table" and type(Auctionator.API) == "table" and Auctionator.API.v1
  if type(api) == "table" and type(api.GetAuctionPriceByItemID) == "function" then
    local ok, price = pcall(api.GetAuctionPriceByItemID, "Unbored", itemID)
    if ok and num(price) and price > 0 then
      return price
    end
  end
  if type(TSM_API) == "table" and type(TSM_API.GetCustomPriceValue) == "function" then
    local ok, price = pcall(TSM_API.GetCustomPriceValue, "dbmarket", "i:" .. tostring(itemID))
    if ok and num(price) and price > 0 then
      return price
    end
  end
  return nil
end

local function T(ctx, key, ...)
  return ns.TL(ctx.lang, key, ...)
end

local function hasLine(ctx, text)
  if type(text) ~= "string" or text == "" or type(ctx.lines) ~= "table" then
    return false
  end
  for i = 1, #ctx.lines do
    if ctx.lines[i] == text then
      return true
    end
  end
  return false
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

local function tradeable(ctx)
  return not bound(ctx) and ctx.info.bindType ~= 4
end

local function equippable(ctx)
  local info = ctx.info
  return (info.classID == CLASS_ARMOR or info.classID == CLASS_WEAPON)
    and info.equipLoc ~= "" and info.equipLoc ~= "INVTYPE_NON_EQUIP_IGNORE"
end

local function myProfessions()
  local profile = type(UnboredCharDB) == "table" and UnboredCharDB.profile or nil
  local list = type(profile) == "table" and profile.professions or nil
  if type(list) ~= "table" and ns.Profile and ns.Profile.Professions then
    list = ns.Profile.Professions()
  end
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

local function result(line, action, rule, line2)
  return { line = line, line2 = line2, action = action, rule = rule }
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

-- 1. Needed for the active Plan.
local function planRule(ctx)
  local mountID = C_MountJournal and C_MountJournal.GetMountFromItem
    and num(ns.Call(C_MountJournal.GetMountFromItem, ctx.itemID)) or nil
  ctx.mountID = mountID
  if ns.Items and ns.Items.PlanTask(ctx.itemID, mountID) then
    return result(T(ctx, "ADV_PLAN"), "keep", 1)
  end
end

-- 2. Starts a quest the player has not taken.
local function questStartRule(ctx)
  local quest = ctx.questInfo
  local questID = type(quest) == "table" and num(quest.questID) or nil
  if not questID or ns.Flag(quest.isActive) then
    return nil
  end
  local title = C_QuestLog and C_QuestLog.GetTitleForQuestID and ns.Call(C_QuestLog.GetTitleForQuestID, questID)
  if type(title) == "string" and title ~= "" then
    return result(T(ctx, "ADV_STARTS_NAMED", title), "use", 2)
  end
  return result(T(ctx, "ADV_STARTS_QUEST"), "use", 2)
end

local function questForItem(name)
  local api = C_QuestLog
  if not api or not api.GetNumQuestLogEntries or not api.GetInfo or not api.GetQuestObjectives then
    return nil
  end
  local count = math.min(num(ns.Call(api.GetNumQuestLogEntries)) or 0, QUEST_SCAN)
  for i = 1, count do
    local info = ns.Call(api.GetInfo, i)
    local questID = type(info) == "table" and not info.isHeader and num(info.questID) or nil
    if questID then
      local objectives = ns.Call(api.GetQuestObjectives, questID)
      for j = 1, type(objectives) == "table" and #objectives or 0 do
        local text = type(objectives[j]) == "table" and objectives[j].text
        if type(text) == "string" and text:find(name, 1, true) then
          return questID, info.title
        end
      end
    end
  end
  return nil
end

-- 3-4. A quest item: turn it in, or keep it.
local function questItemRule(ctx)
  if ctx.info.classID ~= CLASS_QUEST then
    return nil
  end
  local questID, title = questForItem(ctx.info.name)
  if not questID then
    return result(T(ctx, "ADV_QUEST_KEEP"), "keep", 4)
  end
  title = type(title) == "string" and title or ""
  if C_QuestLog.ReadyForTurnIn and ns.Flag(ns.Call(C_QuestLog.ReadyForTurnIn, questID)) then
    local where
    if C_QuestLog.GetNextWaypoint then
      local mapID = num(ns.Call(C_QuestLog.GetNextWaypoint, questID))
      local zone = mapID and ns.MapName(mapID)
      where = zone and T(ctx, "ADV_WHERE", zone) or nil
    end
    return result(T(ctx, "ADV_TURN_IN", title), "turn_in", 3, where)
  end
  return result(T(ctx, "ADV_QUEST_FOR", title), "keep", 4)
end

-- 5-7. Collectibles: mount, toy, pet.
local function mountRule(ctx)
  local state = ctx.mountID and ns.MountState(ctx.mountID)
  if state and state.known and not state.collected then
    if type(state.name) == "string" and state.name ~= "" then
      return result(T(ctx, "ADV_MOUNT_NAMED", state.name), "use", 5)
    end
    return result(T(ctx, "ADV_MOUNT"), "use", 5)
  end
end

local function toyRule(ctx)
  if C_ToyBox and C_ToyBox.GetToyInfo and num(ns.Call(C_ToyBox.GetToyInfo, ctx.itemID))
    and not ns.ToyOwned(ctx.itemID) then
    return result(T(ctx, "ADV_TOY"), "use", 6)
  end
end

local function petRule(ctx)
  if not C_PetJournal or not C_PetJournal.GetPetInfoByItemID or not C_PetJournal.GetNumCollectedInfo then
    return nil
  end
  local r = { pcall(C_PetJournal.GetPetInfoByItemID, ctx.itemID) }
  local speciesID = r[1] and num(r[14])
  if not speciesID then
    return nil
  end
  local owned, limit = ns.Call(C_PetJournal.GetNumCollectedInfo, speciesID)
  owned, limit = num(owned), num(limit)
  if owned == 0 then
    return result(T(ctx, "ADV_PET"), "use", 7)
  end
  if owned and limit and owned >= limit and tradeable(ctx) then
    return result(T(ctx, "ADV_PET_FULL", owned), "sell", 7)
  end
end

-- 8. A recipe or teach item the character already knows.
local function knownRule(ctx)
  if hasLine(ctx, ITEM_SPELL_KNOWN) and ctx.info.quality < 4 then
    return result(T(ctx, "ADV_KNOWN"), "sell", 8)
  end
end

-- 9. Gear with a look this account has not collected and can.
local function lookRule(ctx)
  local api = C_TransmogCollection
  if not equippable(ctx) or not api or not api.GetItemInfo or not api.GetSourceInfo then
    return nil
  end
  local _, sourceID = ns.Call(api.GetItemInfo, ctx.link or ctx.itemID)
  sourceID = num(sourceID)
  local source = sourceID and ns.Call(api.GetSourceInfo, sourceID)
  if type(source) ~= "table" or source.isCollected ~= false or not api.PlayerCanCollectSource then
    return nil
  end
  local _, canCollect = ns.Call(api.PlayerCanCollectSource, sourceID)
  if ns.Flag(canCollect) then
    return result(T(ctx, "ADV_LOOK"), "equip", 9)
  end
end

local function equippedLevel(slot)
  local link = type(GetInventoryItemLink) == "function" and ns.Call(GetInventoryItemLink, "player", slot)
  if type(link) ~= "string" or not C_Item.GetDetailedItemLevelInfo then
    return 0
  end
  return num(ns.Call(C_Item.GetDetailedItemLevelInfo, link)) or 0
end

-- 10. Better than what is equipped, and this class wears it.
local function upgradeRule(ctx)
  local info = ctx.info
  local slots = SLOTS[info.equipLoc]
  if info.classID ~= CLASS_ARMOR or not slots or not ctx.link or not C_Item.GetDetailedItemLevelInfo then
    return nil
  end
  local level = num(ns.PlayerLevel and ns.PlayerLevel()) or 0
  if info.minLevel > level then
    return nil
  end
  if info.subclassID and info.subclassID >= 1 and info.subclassID <= 4 and info.equipLoc ~= "INVTYPE_CLOAK" then
    local _, classFile = ns.Call(UnitClass, "player")
    if ARMOR[classFile] ~= info.subclassID then
      return nil
    end
  end
  local ilvl = num(ns.Call(C_Item.GetDetailedItemLevelInfo, ctx.link))
  if not ilvl then
    return nil
  end
  local worst
  for i = 1, #slots do
    local equipped = equippedLevel(slots[i])
    worst = worst and math.min(worst, equipped) or equipped
  end
  local gain = math.floor(ilvl - (worst or 0))
  if gain > 0 then
    return result(T(ctx, "ADV_UPGRADE", gain), "equip", 10)
  end
end

-- Personal advice from the Companion, then a planner answer about this item.
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

local function bundledRule(ctx)
  local entry = ns.Data.Advice and ns.Data.Advice[ctx.itemID]
  if type(entry) ~= "table" then
    return nil
  end
  local line = safe(entry[ctx.lang]) or safe(entry.en)
  if line then
    return result(line, entry.action or "info", "bundled")
  end
end

-- 13. Poor quality with a vendor price.
local function junkRule(ctx)
  if ctx.info.quality == 0 and ctx.info.sellPrice > 0 then
    return result(T(ctx, "ADV_JUNK"), "sell", 13)
  end
end

-- 11-12. Gear nobody needs: disenchant, vendor if bound, else the AH.
local function gearRule(ctx)
  local info = ctx.info
  if not equippable(ctx) or info.quality < 1 or info.quality > 4 then
    return nil
  end
  if soulbound(ctx) then
    if info.quality >= 2 and professionFor(myProfessions(), { ENCHANTING }) then
      return result(T(ctx, "ADV_DISENCHANT"), "disenchant", 11)
    end
    if info.quality <= 3 and info.sellPrice > 0 then
      return result(T(ctx, "ADV_SELL", ns.Advice.Money(info.sellPrice)), "sell", 12)
    end
    return nil
  end
  if tradeable(ctx) then
    local price = ns.Advice.AuctionPrice(ctx.itemID)
    if price then
      return result(T(ctx, "ADV_AH_PRICE", ns.Advice.Money(price)), "sell", 12)
    end
    return result(T(ctx, "ADV_AH"), "sell", 12)
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

-- 14-15 and D41. A reagent: keep it, send it to the Alt who uses it, or sell.
local function reagentRule(ctx)
  local info = ctx.info
  if info.classID ~= CLASS_TRADEGOODS and not info.isReagent then
    return nil
  end
  local skills = info.classID == CLASS_TRADEGOODS and REAGENT_SKILLS[info.subclassID] or nil
  if skills then
    local own = professionFor(myProfessions(), skills)
    if own then
      return result(T(ctx, "ADV_REAGENT", own.name or ""), "bank", 14)
    end
    if not soulbound(ctx) then
      local alt, row = ns.Advice.AltFor(skills)
      if alt then
        local how = route(ctx, alt)
        local key = how == "mail" and "ADV_SEND_MAIL" or "ADV_SEND_BANK"
        local out = result(T(ctx, key, alt.name, row.name or ""), "send", "alt")
        out.to = alt.name
        return out
      end
    end
  end
  if tradeable(ctx) then
    local price = ns.Advice.AuctionPrice(ctx.itemID)
    if price then
      return result(T(ctx, "ADV_REAGENT_AH", ns.Advice.Money(price)), "sell", 15)
    end
    return result(T(ctx, "ADV_REAGENT_SELL"), "sell", 15)
  end
end

-- 16. Potions, flasks, food.
local function consumableRule(ctx)
  if ctx.info.classID ~= CLASS_CONSUMABLE then
    return nil
  end
  if POTIONS[ctx.info.subclassID] then
    return result(T(ctx, "ADV_POTION"), "keep", 16)
  end
  if ctx.info.subclassID == FOOD then
    return result(T(ctx, "ADV_FOOD"), "keep", 16)
  end
end

-- 17. Something to open.
local function openRule(ctx)
  local slot = ctx.slotInfo
  if (type(slot) == "table" and ns.Flag(slot.hasLoot)) or hasLine(ctx, ITEM_OPENABLE) then
    return result(T(ctx, "ADV_OPEN"), "open", 17)
  end
end

-- 18. No vendor value. Never "delete".
local function noValueRule(ctx)
  local slot = ctx.slotInfo
  if type(slot) == "table" and ns.Flag(slot.hasNoValue) then
    return result(T(ctx, "ADV_NO_VALUE"), "keep", 18)
  end
end

ns.Advice.RULES = {
  planRule,
  questStartRule,
  questItemRule,
  mountRule,
  toyRule,
  petRule,
  knownRule,
  lookRule,
  upgradeRule,
  personalRule,
  bundledRule,
  junkRule,
  gearRule,
  reagentRule,
  consumableRule,
  openRule,
  noValueRule,
}

-- opts: { link, bag, slot, lines = { text, ... }, lang }. Returns nil and
-- "uncached" until the game has the item, or nil and "unmatched" when no
-- rule fits (that itemID is logged to grow the rules).
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
