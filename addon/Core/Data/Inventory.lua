-- Bags, banks and currencies. Banks can only be read while the bank is open,
-- so their Sections keep the last look.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

S.MAX_ITEMS = 1500
local MAX_GEAR = 300
local MAX_CURRENCIES = 300
-- Weapons and armor keep their item string, so upgrades and bonus ids show.
local GEAR_CLASSES = { [2] = true, [4] = true }

local function isGear(itemID)
  if not C_Item or not C_Item.GetItemInfoInstant then
    return false
  end
  local _, _, _, _, _, classID = call(C_Item.GetItemInfoInstant, itemID)
  return GEAR_CLASSES[num(classID) or -1] or false
end

-- { items = idv1 { [itemID] = count }, count, gear = { "item:..." }, slots }
-- over some containers. Counts are packed: a full bank as rows would cost
-- ~80 bytes per item in SavedVariables (docs/adr/0028).
function S.CountContainers(bagIds)
  local api = C_Container
  if not api or not api.GetContainerNumSlots or not api.GetContainerItemInfo then
    return nil
  end
  local counts, order, gear, seenGear = {}, {}, {}, {}
  local slotsSeen = 0
  for i = 1, #bagIds do
    local slots = num(call(api.GetContainerNumSlots, bagIds[i])) or 0
    slotsSeen = slotsSeen + slots
    for slot = 1, slots do
      local info = call(api.GetContainerItemInfo, bagIds[i], slot)
      local itemID = type(info) == "table" and num(info.itemID) or nil
      if itemID then
        if not counts[itemID] then
          order[#order + 1] = itemID
          counts[itemID] = 0
        end
        counts[itemID] = counts[itemID] + (num(info.stackCount) or 1)
        if #gear < MAX_GEAR and isGear(itemID) then
          local itemString = S.ItemString(str(info.hyperlink, 600))
          if itemString and not seenGear[itemString] then
            seenGear[itemString] = true
            gear[#gear + 1] = itemString
          end
        end
      end
      S.Yield()
    end
  end
  if slotsSeen == 0 then
    return nil
  end
  local rows = {}
  for i = 1, math.min(#order, S.MAX_ITEMS) do
    rows[order[i]] = counts[order[i]]
  end
  return {
    items = ns.Pack.EncodeValues(rows),
    count = math.min(#order, S.MAX_ITEMS),
    gear = #gear > 0 and gear or nil,
    slots = slotsSeen,
  }
end

S.Register({
  name = "bags",
  v = 1,
  prio = 70,
  events = { "BAG_UPDATE_DELAYED" },
  read = function()
    local bags = ns.Profile.BagIds()
    return S.CountContainers(bags)
  end,
})

local BANK_OPENS = { "BANKFRAME_OPENED" }
local BANK_CLOSES = { "BANKFRAME_CLOSED" }
local BANK_EVENTS = { "PLAYERBANKSLOTS_CHANGED", "PLAYERREAGENTBANKSLOTS_CHANGED", "BAG_UPDATE_DELAYED" }

local function bankSection(name, scope, prio, pick)
  S.Register({
    name = name,
    scope = scope,
    v = 1,
    prio = prio,
    window = true,
    opens = BANK_OPENS,
    closes = BANK_CLOSES,
    events = BANK_EVENTS,
    read = function()
      if not S.IsOpen(name) then
        return nil
      end
      local ids = pick()
      if #ids == 0 then
        return nil
      end
      -- An empty bank is still a real answer while it is open (count 0).
      return S.CountContainers(ids)
    end,
  })
end

bankSection("bank", "char", 60, function()
  local _, bank = ns.Profile.BagIds()
  return bank
end)
bankSection("reagentBank", "char", 55, function()
  local _, _, _, reagent = ns.Profile.BagIds()
  return reagent
end)
bankSection("warband", "account", 70, function()
  local _, _, warband = ns.Profile.BagIds()
  return warband
end)

-- Collapsed headers hide their currencies, so they are opened for the read
-- and closed again in the same frame. Skipped while the currency tab is shown.
-- TODO(verify-in-game): ExpandCurrencyList restores the player's headers.
local function currencyTabShown()
  local frame = rawget(_G, "TokenFrame")
  return type(frame) == "table" and type(frame.IsShown) == "function" and frame:IsShown() and true or false
end

function S.ReadCurrencies()
  local api = C_CurrencyInfo
  if not api or not api.GetCurrencyListSize or not api.GetCurrencyListInfo then
    return nil
  end
  local canExpand = api.ExpandCurrencyList and not currencyTabShown()
  local opened = {}
  local out = {}
  local i = 1
  local guard = 0
  while i <= (num(call(api.GetCurrencyListSize)) or 0) and guard < 2000 do
    guard = guard + 1
    local info = call(api.GetCurrencyListInfo, i)
    if type(info) == "table" then
      if info.isHeader then
        if canExpand and info.isHeaderExpanded == false then
          local name = str(info.name, 80)
          if name and not opened[name] and pcall(api.ExpandCurrencyList, i, true) then
            opened[name] = true
          end
        end
      elseif #out < MAX_CURRENCIES then
        local id = num(info.currencyID)
        if not id and api.GetCurrencyListLink and api.GetCurrencyIDFromLink then
          id = num(call(api.GetCurrencyIDFromLink, call(api.GetCurrencyListLink, i)))
        end
        local quantity = num(info.quantity)
        local week = num(info.quantityEarnedThisWeek)
        if id and quantity and (quantity > 0 or (week or 0) > 0) then
          out[#out + 1] = {
            id = id,
            quantity = quantity,
            max = num(info.maxQuantity),
            week = week,
            weekMax = num(info.maxWeeklyQuantity),
            accountWide = info.isAccountWide == true or nil,
            transferable = info.isAccountTransferable == true or nil,
          }
        end
      end
    end
    i = i + 1
  end
  if next(opened) then
    for index = (num(call(api.GetCurrencyListSize)) or 0), 1, -1 do
      local info = call(api.GetCurrencyListInfo, index)
      if type(info) == "table" and info.isHeader and info.isHeaderExpanded and opened[str(info.name, 80) or ""] then
        pcall(api.ExpandCurrencyList, index, false)
      end
    end
  end
  return #out > 0 and { list = out } or nil
end

S.Register({
  name = "currencies",
  v = 1,
  prio = 75,
  events = { "CURRENCY_DISPLAY_UPDATE" },
  read = S.ReadCurrencies,
})
