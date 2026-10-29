-- Item help: one short line in the item tooltip when there is something to
-- say, the item a player hands to the mascot, and Alt+Right-click in bags.
-- Everything here only reads game state. Bag buttons are never replaced or
-- re-scripted; the click hook is a hooksecurefunc post-hook.

local _, ns = ...

ns.Items = {}

local TEAL = "|cff5fe3d4"
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

local function firstLine(text, limit)
  local line = text:match("^[^\n]+") or text
  if #line > limit then
    line = ns.Utf8Truncate(line, limit - 3) .. "..."
  end
  return line
end

-- Short lines about an item, most useful first. full adds the transmog line
-- (the game already says that one in the tooltip) and the whole answer.
function ns.Items.Facts(itemID, link, full)
  itemID = num(itemID)
  if not itemID then
    return {}
  end
  local lines = {}
  local answer = ns.Session.ItemNote(itemID)
  if answer then
    lines[#lines + 1] = full and answer or firstLine(answer, 160)
  end
  local key = ns.Data.ItemNotes and ns.Data.ItemNotes[itemID]
  if key then
    lines[#lines + 1] = ns.T(key)
  end
  local mountFact, mountID = ns.Items.MountFact(itemID)
  local task = ns.Items.PlanTask(itemID, mountID)
  if task then
    lines[#lines + 1] = ns.T("FACT_PLAN", task.title or "")
  end
  local collectible = mountFact or ns.Items.PetFact(itemID) or ns.Items.ToyFact(itemID)
  if not collectible and full then
    collectible = ns.Items.LookFact(itemID, link)
  end
  if collectible then
    lines[#lines + 1] = collectible
  end
  return lines
end

function ns.Items.OnTooltip(tooltip, data)
  if tooltip ~= GameTooltip and tooltip ~= ItemRefTooltip then
    return
  end
  local itemID = type(data) == "table" and num(data.id)
  if not itemID then
    return
  end
  local lines = ns.Items.Facts(itemID, nil, false)
  for i = 1, math.min(#lines, 3) do
    tooltip:AddLine(TEAL .. ns.MASCOT_NAME .. ":|r " .. lines[i], 1, 1, 1, true)
  end
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

function ns.Items.OnModifiedClick(link, itemLocation)
  if type(IsAltKeyDown) ~= "function" or not ns.Call(IsAltKeyDown) then
    return
  end
  if type(GetMouseButtonClicked) == "function" and ns.Call(GetMouseButtonClicked) ~= "RightButton" then
    return
  end
  local item = ns.Items.FromLink(link)
  if not item then
    return
  end
  local bag, slot
  if type(itemLocation) == "table" and itemLocation.IsBagAndSlot then
    local okBag, isBag = pcall(itemLocation.IsBagAndSlot, itemLocation)
    if okBag and isBag then
      bag, slot = ns.Call(itemLocation.GetBagAndSlot, itemLocation)
    end
  end
  ns.Items.WithBagContext(item, num(bag), num(slot))
  if ns.UI and ns.UI.OpenItem then
    ns.UI:OpenItem(item)
  end
end

function ns.Items.Hook()
  if ns.Items.hooked then
    return
  end
  ns.Items.hooked = true
  if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    pcall(TooltipDataProcessor.AddTooltipPostCall, Enum.TooltipDataType.Item, ns.Items.OnTooltip)
  end
  if type(hooksecurefunc) == "function" and type(HandleModifiedItemClick) == "function" then
    pcall(hooksecurefunc, "HandleModifiedItemClick", ns.Items.OnModifiedClick)
  end
end
