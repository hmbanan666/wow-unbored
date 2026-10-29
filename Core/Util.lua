local _, ns = ...

function ns.IsCombat()
  if type(InCombatLockdown) ~= "function" then
    return false
  end
  local ok, locked = pcall(InCombatLockdown)
  return ok and locked and true or false
end

function ns.IsInstance()
  if type(IsInInstance) ~= "function" then
    return false
  end
  local ok, inside, kind = pcall(IsInInstance)
  if not ok or not inside then
    return false
  end
  return kind == "party" or kind == "raid" or kind == "arena" or kind == "pvp" or kind == "scenario"
end

function ns.IsPaused()
  return ns.IsCombat() or ns.IsInstance()
end

function ns.ReadXY(pos)
  if pos == nil then
    return nil
  end
  local x, y
  local ok = pcall(function()
    x, y = pos.x, pos.y
  end)
  if not ok or x == nil or y == nil then
    if type(pos) == "table" or type(pos) == "userdata" then
      local getter = pos.GetXY
      if type(getter) == "function" then
        local okGet, a, b = pcall(getter, pos)
        if okGet then
          x, y = a, b
        end
      end
    end
  end
  return ns.AsNumber(x), ns.AsNumber(y)
end

function ns.PlayerPosition()
  if ns.IsPaused() then
    return nil
  end
  if not C_Map or not C_Map.GetBestMapForUnit or not C_Map.GetPlayerMapPosition then
    return nil
  end
  local okMap, mapID = pcall(C_Map.GetBestMapForUnit, "player")
  if not okMap then
    return nil
  end
  mapID = ns.AsNumber(mapID)
  if not mapID then
    return nil
  end
  local okPos, pos = pcall(C_Map.GetPlayerMapPosition, mapID, "player")
  if not okPos then
    return mapID
  end
  local x, y = ns.ReadXY(pos)
  if not x or not y then
    return mapID
  end
  return mapID, x, y
end

function ns.MapName(mapID)
  mapID = ns.AsNumber(mapID)
  if not mapID or not C_Map or not C_Map.GetMapInfo then
    return nil
  end
  local ok, info = pcall(C_Map.GetMapInfo, mapID)
  if ok and type(info) == "table" then
    return info.name
  end
  return nil
end

function ns.WorldXY(mapID, x, y)
  if not C_Map or not C_Map.GetWorldPosFromMapPos then
    return nil
  end
  local ok, continent, world = pcall(C_Map.GetWorldPosFromMapPos, mapID, { x = x, y = y })
  if not ok or not world then
    return nil
  end
  continent = ns.AsNumber(continent)
  local wx, wy = ns.ReadXY(world)
  if not continent or not wx or not wy then
    return nil
  end
  return continent, wx, wy
end

function ns.YardsBetween(mapA, xA, yA, mapB, xB, yB)
  mapA = ns.AsNumber(mapA)
  mapB = ns.AsNumber(mapB)
  xA, yA, xB, yB = ns.AsNumber(xA), ns.AsNumber(yA), ns.AsNumber(xB), ns.AsNumber(yB)
  if not mapA or not mapB or not xA or not yA or not xB or not yB then
    return nil
  end
  local c1, wx1, wy1 = ns.WorldXY(mapA, xA, yA)
  local c2, wx2, wy2 = ns.WorldXY(mapB, xB, yB)
  if c1 and c2 then
    if c1 ~= c2 then
      return nil
    end
    local dx, dy = wx1 - wx2, wy1 - wy2
    return math.sqrt(dx * dx + dy * dy)
  end
  if mapA == mapB and C_Map and C_Map.GetMapWorldSize then
    local ok, width, height = pcall(C_Map.GetMapWorldSize, mapA)
    width, height = ns.AsNumber(width), ns.AsNumber(height)
    if ok and width and height and width > 0 and height > 0 then
      local dx = (xA - xB) * width
      local dy = (yA - yB) * height
      return math.sqrt(dx * dx + dy * dy)
    end
  end
  return nil
end

function ns.Near(mapID, x, y, radius)
  local playerMap, px, py = ns.PlayerPosition()
  if not playerMap or not px or not py then
    return false
  end
  local yards = ns.YardsBetween(playerMap, px, py, mapID, x, y)
  if not yards then
    return false
  end
  return yards <= (radius or 40)
end

function ns.NearbyMaps(mapID)
  local out = {}
  local seen = {}
  local function add(id)
    id = ns.AsNumber(id)
    if id and id > 0 and not seen[id] then
      seen[id] = true
      out[#out + 1] = id
    end
  end
  add(mapID)
  if not mapID or not C_Map or not C_Map.GetMapInfo or not C_Map.GetMapChildrenInfo then
    return out
  end
  local ok, info = pcall(C_Map.GetMapInfo, mapID)
  if not ok or type(info) ~= "table" then
    return out
  end
  local parent = ns.AsNumber(info.parentMapID)
  if not parent or parent <= 0 then
    return out
  end
  add(parent)
  local okChildren, children = pcall(C_Map.GetMapChildrenInfo, parent)
  if okChildren and type(children) == "table" then
    for i = 1, #children do
      local child = children[i]
      if type(child) == "table" then
        add(child.mapID)
      end
      if #out >= 12 then
        break
      end
    end
  end
  return out
end

function ns.PlayerFaction()
  if type(UnitFactionGroup) ~= "function" then
    return nil
  end
  local ok, faction = pcall(UnitFactionGroup, "player")
  if ok and (faction == "Alliance" or faction == "Horde") then
    return faction
  end
  return nil
end

function ns.PlayerLevel()
  local level
  if type(UnitLevel) == "function" then
    local ok, value = pcall(UnitLevel, "player")
    if ok then
      level = ns.AsNumber(value)
    end
  end
  if level and UnboredCharDB then
    UnboredCharDB.level = level
  end
  if level then
    return level
  end
  if UnboredCharDB and type(UnboredCharDB.level) == "number" then
    return UnboredCharDB.level
  end
  return 80
end

function ns.BuildContext(budget)
  local mapID, x, y = ns.PlayerPosition()
  return {
    budget = budget or 60,
    mapID = mapID,
    x = x,
    y = y,
    level = ns.PlayerLevel(),
    faction = ns.PlayerFaction(),
    dismissed = {},
  }
end

function ns.AddonLoaded(name)
  if C_AddOns and C_AddOns.IsAddOnLoaded then
    local ok, loaded = pcall(C_AddOns.IsAddOnLoaded, name)
    if ok then
      return loaded and true or false
    end
  end
  return false
end

function ns.ClickSound()
  if type(PlaySound) ~= "function" or type(SOUNDKIT) ~= "table" then
    return
  end
  local id = SOUNDKIT.IG_MAINMENU_OPTION_CHECKBOX_ON
  if id then
    pcall(PlaySound, id)
  end
end
