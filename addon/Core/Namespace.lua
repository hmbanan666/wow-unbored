local addonName, ns = ...

ns.addon = addonName or "Unbored"
-- Must match ## Version in Unbored.toc (tests/run.lua checks it).
ns.VERSION = "0.7.0"
ns.MASCOT_NAME = "Bory"
ns.MEDIA = "Interface\\AddOns\\Unbored\\Media\\"

-- Bory's palette (BRAND.md): every colour the UI draws comes from here.
ns.PALETTE = {
  gold = { 0.910, 0.690, 0.290 }, -- #E8B04A, the accent: borders, glyphs, pips
  highlight = { 0.961, 0.824, 0.478 }, -- #F5D27A, titles and the selected chip
  burgundy = { 0.478, 0.133, 0.188 }, -- #7A2230, Bory's scarf: done and selected fills
  bg = { 0.118, 0.078, 0.063 }, -- #1E1410, bubbles and pills
  raised = { 0.165, 0.110, 0.082 }, -- #2A1C15, buttons and chips
  cream = { 0.918, 0.859, 0.753 }, -- #EADBC0, body text
  muted = { 0.722, 0.639, 0.522 }, -- #B8A385, secondary text
  faint = { 0.502, 0.431, 0.361 }, -- #806E5C, done and skipped rows
  ok = { 0.604, 0.784, 0.392 }, -- #9AC864, Ready
}

-- "|cffRRGGBB" for a palette colour, for text that carries its own colour.
function ns.Hex(color)
  return string.format(
    "|cff%02x%02x%02x",
    math.floor(color[1] * 255 + 0.5),
    math.floor(color[2] * 255 + 0.5),
    math.floor(color[3] * 255 + 0.5)
  )
end
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

-- The same string in a given language ("en" or "ru"), whatever the client
-- runs in: an Answer follows the language of the question (docs/adr/0014).
function ns.TL(lang, key, ...)
  local table_ = ns.Locales and ns.Locales[lang] or nil
  local text = (table_ and table_[key]) or (ns.L and ns.L[key]) or key
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
  local line = ns.Hex(ns.PALETTE.gold) .. "Unbored|r  " .. tostring(msg)
  if DEFAULT_CHAT_FRAME and DEFAULT_CHAT_FRAME.AddMessage then
    DEFAULT_CHAT_FRAME:AddMessage(line)
  else
    print("Unbored: " .. tostring(msg))
  end
end

ns.ERRORS_MAX = 10

-- A caught Lua error: kept in UnboredDB.errors for the developer, and the
-- player gets one friendly chat line per session instead of a stack trace.
function ns.ReportError(err)
  local text = tostring(err)
  if type(UnboredDB) == "table" then
    if type(UnboredDB.errors) ~= "table" then
      UnboredDB.errors = {}
    end
    local list = UnboredDB.errors
    list[#list + 1] = { at = ns.Now and ns.Now() or 0, version = ns.VERSION, text = text:sub(1, 600) }
    while #list > ns.ERRORS_MAX do
      table.remove(list, 1)
    end
  end
  if not ns.errorShown then
    ns.errorShown = true
    ns.Print(ns.T and ns.T("OOPS") or "Bory tripped over something.")
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
