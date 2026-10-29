local addonName, ns = ...

ns.addon = addonName or "Unbored"
ns.MASCOT_NAME = "Wisp"
ns.MEDIA = "Interface\\AddOns\\Unbored\\Media\\"
-- A plan is 3-7 steps (docs/adr/0005); the in-game builder never makes more.
ns.MAX_STEPS = 7
ns.Data = {}
ns.Providers = {}
ns.ProviderOrder = {}
ns.DB = nil

ns.MODES = {
  { id = "roam", key = "MODE_ROAM" },
  { id = "quests", key = "MODE_QUESTS" },
  { id = "events", key = "MODE_EVENTS" },
  { id = "fun", key = "MODE_FUN" },
  { id = "farm", key = "MODE_FARM" },
}

ns.MODE_IDS = {
  roam = true,
  quests = true,
  events = true,
  fun = true,
  farm = true,
  custom = true,
}

function ns.RegisterProvider(def)
  ns.Providers[def.id] = def
  ns.ProviderOrder[#ns.ProviderOrder + 1] = def.id
end

function ns.T(key, ...)
  local text = (ns.L and ns.L[key]) or key
  if select("#", ...) > 0 then
    local ok, formatted = pcall(string.format, text, ...)
    if ok then
      return formatted
    end
  end
  return text
end

function ns.ModeLabel(mode)
  for i = 1, #ns.MODES do
    if ns.MODES[i].id == mode then
      return ns.T(ns.MODES[i].key)
    end
  end
  if mode == "custom" then
    return ns.T("MODE_CUSTOM")
  end
  return mode or ""
end

function ns.Print(msg)
  local line = "|cff8fd18fUnbored|r  " .. tostring(msg)
  if DEFAULT_CHAT_FRAME and DEFAULT_CHAT_FRAME.AddMessage then
    DEFAULT_CHAT_FRAME:AddMessage(line)
  else
    print("Unbored: " .. tostring(msg))
  end
end

function ns.Now()
  if type(time) == "function" then
    local ok, value = pcall(time)
    if ok and type(value) == "number" then
      return value
    end
  end
  return os.time()
end

function ns.Trim(text)
  if type(text) ~= "string" then
    return ""
  end
  return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- True only for a real boolean true. A nil or Midnight secret stays false
-- instead of throwing on login before that API has data.
function ns.Flag(value)
  local ok, isTrue = pcall(function()
    return value == true
  end)
  return ok and isTrue or false
end

function ns.AsNumber(value)
  if value == nil then
    return nil
  end
  if type(issecretvalue) == "function" then
    local ok, secret = pcall(issecretvalue, value)
    if ok and secret then
      return nil
    end
  end
  local ok, number = pcall(function()
    if type(value) ~= "number" then
      return nil
    end
    if value ~= value or value == math.huge or value == -math.huge then
      return nil
    end
    return value
  end)
  if not ok or type(number) ~= "number" then
    return nil
  end
  return number
end

function ns.DeepCopy(value, depth)
  if type(value) ~= "table" then
    if type(value) == "string" or type(value) == "number" or type(value) == "boolean" then
      return value
    end
    return nil
  end
  depth = (depth or 0) + 1
  if depth > 8 then
    return nil
  end
  local out = {}
  for key, item in pairs(value) do
    if type(key) == "string" or type(key) == "number" then
      local copied = ns.DeepCopy(item, depth)
      if copied ~= nil or item == false then
        out[key] = copied
      end
    end
  end
  return out
end

Unbored = ns
