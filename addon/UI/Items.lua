-- Item help (docs/adr/0015, 0035): the Advice line in item tooltips and the
-- item a player hands to Bory (dropped on it, or picked up in pick mode).
-- Everything here only reads game state. Bag buttons are never touched.

local _, ns = ...

ns.Items = {}

local ACCENT = ns.Hex(ns.PALETTE.gold)
local BAGS = 5

local function num(value)
  return ns.AsNumber(value)
end

function ns.Items.MountFact(itemID)
  if not C_MountJournal or not C_MountJournal.GetMountFromItem then
    return nil
  end
  local mountID = num(ns.Call(C_MountJournal.GetMountFromItem, itemID))
  local state = mountID and ns.MountState(mountID)
  if not state or not state.known then
    return nil, mountID
  end
  return state.collected and ns.T("FACT_MOUNT_OWNED") or ns.T("FACT_MOUNT_NEW"), mountID
end

function ns.Items.PetFact(itemID)
  if not C_PetJournal or not C_PetJournal.GetPetInfoByItemID then
    return nil
  end
  local results = { pcall(C_PetJournal.GetPetInfoByItemID, itemID) }
  -- Return 13 is speciesID, so results[14] after the pcall ok flag.
  local speciesID = results[1] and num(results[14])
  if not speciesID or not C_PetJournal.GetNumCollectedInfo then
    return nil
  end
  local owned, limit = ns.Call(C_PetJournal.GetNumCollectedInfo, speciesID)
  owned, limit = num(owned), num(limit)
  if not owned then
    return nil
  end
  if owned == 0 then
    return ns.T("FACT_PET_NEW")
  end
  return ns.T("FACT_PET_OWNED", owned, limit or owned)
end

function ns.Items.ToyFact(itemID)
  if not C_ToyBox or not C_ToyBox.GetToyInfo then
    return nil
  end
  if not num(ns.Call(C_ToyBox.GetToyInfo, itemID)) then
    return nil
  end
  return ns.ToyOwned(itemID) and ns.T("FACT_TOY_OWNED") or ns.T("FACT_TOY_NEW")
end

function ns.Items.LookFact(itemID, link)
  local collection = C_TransmogCollection
  if not collection or not collection.GetItemInfo or not collection.GetSourceInfo then
    return nil
  end
  local _, sourceID = ns.Call(collection.GetItemInfo, link or itemID)
  sourceID = num(sourceID)
  local info = sourceID and ns.Call(collection.GetSourceInfo, sourceID)
  if type(info) == "table" and info.isCollected == false then
    return ns.T("FACT_LOOK_NEW")
  end
  return nil
end

local function mentions(spec, itemID, mountID, depth)
  if type(spec) ~= "table" or depth > 3 then
    return false
  end
  if num(spec.itemID) == itemID then
    return true
  end
  if mountID then
    if num(spec.mountID) == mountID then
      return true
    end
    if type(spec.mountIDs) == "table" then
      for i = 1, #spec.mountIDs do
        if num(spec.mountIDs[i]) == mountID then
          return true
        end
      end
    end
  end
  if type(spec.any) == "table" then
    for i = 1, #spec.any do
      if mentions(spec.any[i], itemID, mountID, depth + 1) then
        return true
      end
    end
  end
  return false
end

function ns.Items.PlanTask(itemID, mountID)
  local state = ns.Session and ns.Session.state
  local tasks = type(state) == "table" and state.tasks or nil
  if type(tasks) ~= "table" then
    return nil
  end
  for i = 1, #tasks do
    if mentions(tasks[i].complete, itemID, mountID, 1) then
      return tasks[i]
    end
  end
  return nil
end

-- What Bory says about an item in the bubble: the Advice first, then what
-- else is known (a planner answer, a note, the plan, collections).
function ns.Items.Facts(itemID, link, where)
  itemID = num(itemID)
  if not itemID then
    return {}
  end
  where = type(where) == "table" and where or {}
  local lines = {}
  local advice = ns.Advice.For(itemID, { link = link, bag = where.bag, slot = where.slot })
  local rule = advice and advice.rule
  if advice then
    lines[#lines + 1] = advice.line
  end
  local answer = ns.Session.ItemNote(itemID)
  if answer and rule ~= "answer" then
    lines[#lines + 1] = answer
  end
  local key = ns.Data.ItemNotes and ns.Data.ItemNotes[itemID]
  if key then
    lines[#lines + 1] = ns.T(key)
  end
  local mountFact, mountID = ns.Items.MountFact(itemID)
  local task = rule ~= "plan" and ns.Items.PlanTask(itemID, mountID)
  if task then
    lines[#lines + 1] = ns.T("FACT_PLAN", ns.Markup.Plain(task.title or "", task.npcs))
  end
  if rule ~= "collection" then
    local collectible = mountFact or ns.Items.PetFact(itemID) or ns.Items.ToyFact(itemID)
      or ns.Items.LookFact(itemID, link)
    if collectible then
      lines[#lines + 1] = collectible
    end
  end
  return lines
end

local function tooltipLines(data)
  local out = {}
  local lines = type(data) == "table" and data.lines or nil
  for i = 1, type(lines) == "table" and #lines or 0 do
    local text = type(lines[i]) == "table" and lines[i].leftText
    if type(text) == "string" then
      out[#out + 1] = text
    end
  end
  return out
end

-- Bag and slot of a bag item's tooltip, when the game says.
local function tooltipSlot(data)
  local guid = type(data) == "table" and data.guid or nil
  if not guid or not C_Item or not C_Item.GetItemLocation then
    return nil
  end
  local location = ns.Call(C_Item.GetItemLocation, guid)
  if type(location) ~= "table" or not location.IsBagAndSlot then
    return nil
  end
  local ok, isBag = pcall(location.IsBagAndSlot, location)
  if not ok or not isBag then
    return nil
  end
  return ns.Call(location.GetBagAndSlot, location)
end

-- At most one accent line, and only when Bory has something personal to say.
function ns.Items.OnTooltip(tooltip, data)
  if tooltip ~= GameTooltip and tooltip ~= ItemRefTooltip then
    return
  end
  if ns.DB and ns.DB.tooltipLines == false then
    return
  end
  if ns.IsCombat() then
    return
  end
  local itemID = type(data) == "table" and num(data.id)
  if not itemID then
    return
  end
  local link
  if tooltip.GetItem then
    local okItem, _, itemLink = pcall(tooltip.GetItem, tooltip)
    link = okItem and type(itemLink) == "string" and itemLink or nil
  end
  local bag, slot = tooltipSlot(data)
  local where = { link = link, bag = num(bag), slot = num(slot), lines = tooltipLines(data) }
  local advice = ns.Advice.For(itemID, where)
  if not advice or not advice.line then
    return
  end
  tooltip:AddLine(ACCENT .. ns.MASCOT_NAME .. ":|r " .. advice.line, 1, 1, 1, true)
end

function ns.Items.FromLink(link)
  if type(link) ~= "string" then
    return nil
  end
  local itemID = num(tonumber(link:match("item:(%d+)") or ""))
  if not itemID then
    return nil
  end
  return { itemID = itemID, link = link, name = link:match("%[(.-)%]") }
end

local function slotInfo(bag, slot)
  if not C_Container or not C_Container.GetContainerItemInfo then
    return nil
  end
  local info = ns.Call(C_Container.GetContainerItemInfo, bag, slot)
  return type(info) == "table" and info or nil
end

-- Where the item sits in the bags, and how many there are in total.
function ns.Items.WithBagContext(item, bag, slot)
  if not item or not C_Container or not C_Container.GetContainerNumSlots then
    return item
  end
  local total = 0
  for b = 0, BAGS do
    local slots = num(ns.Call(C_Container.GetContainerNumSlots, b)) or 0
    for s = 1, slots do
      local info = slotInfo(b, s)
      if info and num(info.itemID) == item.itemID then
        total = total + (num(info.stackCount) or 1)
        if bag == nil then
          bag, slot = b, s
        end
      end
    end
  end
  item.bag, item.slot = bag, slot
  item.count = total > 0 and total or nil
  return item
end

function ns.Items.FromCursor()
  if type(GetCursorInfo) ~= "function" then
    return nil
  end
  local kind, itemID, link = ns.Call(GetCursorInfo)
  if kind ~= "item" then
    return nil
  end
  local item = ns.Items.FromLink(link) or (num(itemID) and { itemID = num(itemID) })
  if type(ClearCursor) == "function" then
    pcall(ClearCursor)
  end
  return ns.Items.WithBagContext(item)
end

function ns.Items.Hook()
  if ns.Items.hooked then
    return
  end
  ns.Items.hooked = true
  if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    pcall(TooltipDataProcessor.AddTooltipPostCall, Enum.TooltipDataType.Item, ns.Items.OnTooltip)
  end
end
