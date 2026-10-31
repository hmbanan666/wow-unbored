local addonName, ns = ...

ns.addon = addonName or "Unbored"
-- Must match ## Version in Unbored.toc (tests/run.lua checks it).
ns.VERSION = "0.9.1"
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

-- Error reports (docs/adr/0051): at most 10 rows, one per where+text+version.
ns.ERRORS_MAX = 10
ns.ERROR_TEXT_MAX = 300
ns.ERROR_STACK_MAX = 800
ns.ERROR_FRAMES = 8
-- Rows caught before the SavedVariables are loaded; written at PLAYER_LOGIN.
ns.pendingErrors = {}

-- `[string "@Interface/AddOns/X.lua"]` and `C:/Games/.../Interface/AddOns/X`
-- both become `Interface/AddOns/X`, so no local folder names leave the PC.
local function cutPaths(text)
  text = text:gsub("\\", "/")
  text = text:gsub('%[string "@?([^"]*)"%]', "%1")
  text = text:gsub("%a:/[^\n]-Interface/AddOns/", "Interface/AddOns/")
  text = text:gsub("[^%s\"'<>%(]*Interface/AddOns/", "Interface/AddOns/")
  return text
end

function ns.CleanErrorText(err)
  local text = cutPaths(tostring(err))
  text = text:gsub('"[^"]*"', '"…"'):gsub("'[^']*'", '"…"')
  text = text:gsub("[\r\n]+", " ")
  return text:sub(1, ns.ERROR_TEXT_MAX)
end

-- Only our own frames and C calls are kept: no other addon, no values.
function ns.CleanErrorStack(stack)
  if type(stack) ~= "string" or stack == "" then
    return nil
  end
  local kept = {}
  for line in cutPaths(stack):gmatch("[^\n]+") do
    if line:find("AddOns/Unbored/", 1, true) or line:find("[C]", 1, true) then
      kept[#kept + 1] = ns.Trim(line)
      if #kept >= ns.ERROR_FRAMES then
        break
      end
    end
  end
  if #kept == 0 then
    return nil
  end
  return table.concat(kept, "\n"):sub(1, ns.ERROR_STACK_MAX)
end

local function errorList()
  if type(UnboredDB) ~= "table" or not ns.DB then
    return ns.pendingErrors
  end
  if type(UnboredDB.errors) ~= "table" then
    UnboredDB.errors = {}
  end
  return UnboredDB.errors
end

local function addRow(list, row)
  for i = 1, #list do
    local old = list[i]
    if old.where == row.where and old.text == row.text and old.version == row.version then
      old.count = (tonumber(old.count) or 1) + (row.count or 1)
      old.lastAt = math.max(tonumber(old.lastAt) or 0, row.lastAt or 0)
      old.stack = old.stack or row.stack
      return
    end
  end
  list[#list + 1] = row
  while #list > ns.ERRORS_MAX do
    local oldest = 1
    for i = 2, #list do
      if (tonumber(list[i].lastAt) or 0) < (tonumber(list[oldest].lastAt) or 0) then
        oldest = i
      end
    end
    table.remove(list, oldest)
  end
end

-- The account Section `errors` mirrors the list; with sharing off S.Write
-- refuses it, so the rows stay on this PC.
function ns.WriteErrors()
  local S = ns.Snapshot
  if not S or not S.defs or not S.defs.errors or type(UnboredDB) ~= "table" or not ns.DB then
    return false
  end
  local list = errorList()
  if #list == 0 then
    return false
  end
  return S.Write("errors", { rows = list }, "event")
end

-- PLAYER_LOGIN: the rows caught while loading join the saved list. Rows from
-- 0.9 have no `where` and were never cleaned, so they go.
function ns.FlushErrors()
  if type(UnboredDB) ~= "table" or not ns.DB then
    return
  end
  local list = errorList()
  for i = #list, 1, -1 do
    if type(list[i]) ~= "table" or not list[i].where then
      table.remove(list, i)
    end
  end
  local pending = ns.pendingErrors
  ns.pendingErrors = {}
  for i = 1, #pending do
    addRow(list, pending[i])
  end
  ns.WriteErrors()
end

-- A caught Lua error: where it broke, the message and our own stack frames,
-- for the developer. The player gets one friendly chat line per session.
-- where: "section:<name>", "event:<EVENT>", "ui:<view>" or "init".
function ns.ReportError(err, where, stack)
  local now = ns.Now and ns.Now() or 0
  local row = {
    at = now,
    lastAt = now,
    count = 1,
    version = ns.VERSION,
    where = type(where) == "string" and where:sub(1, 60) or "init",
    text = ns.CleanErrorText(err),
    stack = ns.CleanErrorStack(stack),
  }
  addRow(errorList(), row)
  pcall(ns.WriteErrors)
  if not ns.errorShown then
    ns.errorShown = true
    ns.Print(ns.T and ns.T("OOPS") or "Bory tripped over something.")
  end
end

-- The xpcall handler: runs before the stack unwinds, so it can read it.
-- Level 2 is the function that raised the error.
local handlers = {}
function ns.ErrorHandler(where)
  if not handlers[where] then
    handlers[where] = function(err)
      local stack = type(debugstack) == "function" and debugstack(2, ns.ERROR_FRAMES, 0) or nil
      ns.ReportError(err, where, stack)
      return err
    end
  end
  return handlers[where]
end

-- The stack of a coroutine that failed (a staged read).
-- TODO(verify-in-game): debugstack on a dead coroutine returns its frames.
function ns.CoroutineStack(co)
  if type(debugstack) ~= "function" or not co then
    return nil
  end
  local ok, stack = pcall(debugstack, co, 1, ns.ERROR_FRAMES, 0)
  return ok and stack or nil
end

-- pcall with a report: true when fn ran without an error.
function ns.Guard(where, fn, ...)
  local args, count = { ... }, select("#", ...)
  return xpcall(function()
    return fn(unpack(args, 1, count))
  end, ns.ErrorHandler(where))
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
