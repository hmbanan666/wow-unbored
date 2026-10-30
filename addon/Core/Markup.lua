-- Entity tokens in Plan text (packages/contracts/markup.md, docs/adr/0034):
-- {item:ID}, {quest:ID}, {ach:ID}, {spell:ID}, {currency:ID}, {npc:ID} and
-- {pin:MAPID:X:Y}, each with an optional |label. The Bubble shows native
-- hyperlinks with names from the game; everywhere else gets plain text.

local _, ns = ...

ns.Markup = {}
local M = ns.Markup

M.MAX_TOKENS = 12
M.MAX_LABEL_BYTES = 80
M.MAX_NPCS = 40
-- How long a name may take to load before the token falls back to its label.
M.LOAD_SECONDS = 3

local TYPES = { item = true, quest = true, ach = true, spell = true, currency = true, npc = true, pin = true }
local TOKEN = "{(%l+):([^{}|]*)(|?)([^{}]*)}"
local LINK_PREFIX = "addon:Unbored:"

local function positiveId(text)
  if type(text) ~= "string" or not text:match("^[1-9]%d*$") or #text > 10 then
    return nil
  end
  local id = tonumber(text)
  return id and id <= 2147483647 and id or nil
end

local function percent(text)
  if type(text) ~= "string" then
    return nil
  end
  if not (text:match("^%d%d?%d?$") or text:match("^%d%d?%d?%.%d$")) then
    return nil
  end
  local value = tonumber(text)
  return value and value <= 100 and value or nil
end

-- One token, or nil and the label to show instead.
local function readToken(kind, payload, label)
  label = label and ns.Trim(label) or nil
  if label == "" then
    label = nil
  end
  if label and #label > M.MAX_LABEL_BYTES then
    return nil, nil
  end
  if not TYPES[kind] then
    return nil, label
  end
  if kind == "pin" then
    local a, b, c = payload:match("^([^:]*):([^:]*):([^:]*)$")
    local mapID, x, y = positiveId(a), percent(b), percent(c)
    if not mapID or not x or not y then
      return nil, label
    end
    return { type = kind, mapID = mapID, x = x, y = y, label = label }
  end
  local id = positiveId(payload)
  if not id then
    return nil, label
  end
  return { type = kind, id = id, label = label }
end

-- Plain strings and token tables, in order. A malformed token becomes its label.
function M.Parse(text)
  local out = {}
  if type(text) ~= "string" then
    return out
  end
  local at = 1
  while true do
    local s, e, kind, payload, bar, label = text:find(TOKEN, at)
    if not s then
      break
    end
    if s > at then
      out[#out + 1] = text:sub(at, s - 1)
    end
    local token, fallback = readToken(kind, payload, bar == "|" and label or nil)
    if token then
      token.raw = text:sub(s, e)
      out[#out + 1] = token
    elseif fallback then
      out[#out + 1] = fallback
    end
    at = e + 1
  end
  if at <= #text then
    out[#out + 1] = text:sub(at)
  end
  return out
end

function M.HasTokens(text)
  return type(text) == "string" and text:find(TOKEN) ~= nil
end

-- entities.npc from a Plan or answer: only well-formed entries, keyed by id text.
function M.CleanEntities(raw)
  if type(raw) ~= "table" or type(raw.npc) ~= "table" then
    return nil
  end
  local out, count = {}, 0
  for key, entry in pairs(raw.npc) do
    local id = positiveId(tostring(key))
    local name = type(entry) == "table" and type(entry.name) == "string" and ns.Trim(entry.name) or ""
    if id and name ~= "" and #name <= M.MAX_LABEL_BYTES and count < M.MAX_NPCS then
      local clean = { name = name }
      local mapID = tonumber(entry.mapID)
      local x, y = tonumber(entry.x), tonumber(entry.y)
      if mapID and mapID >= 1 and mapID % 1 == 0 then
        clean.mapID = mapID
        if x and y and x >= 0 and x <= 100 and y >= 0 and y <= 100 then
          clean.x, clean.y = x, y
        end
      end
      out[tostring(id)] = clean
      count = count + 1
    end
  end
  return count > 0 and out or nil
end

-- The npcs one Step (or message) links to, so each task carries its own.
function M.NpcsFor(npcs, ...)
  if type(npcs) ~= "table" then
    return nil
  end
  local out, any = {}, false
  for i = 1, select("#", ...) do
    for _, part in ipairs(M.Parse(select(i, ...))) do
      if type(part) == "table" and part.type == "npc" then
        local entry = npcs[tostring(part.id)]
        if entry then
          out[tostring(part.id)] = entry
          any = true
        end
      end
    end
  end
  return any and out or nil
end

local function zoneName(mapID)
  local info = mapID and C_Map and C_Map.GetMapInfo and ns.Call(C_Map.GetMapInfo, mapID)
  return type(info) == "table" and type(info.name) == "string" and info.name or nil
end

local function coords(x, y)
  return string.format("%.1f, %.1f", x, y)
end

local function pinText(token)
  if token.label then
    return token.label
  end
  local zone = zoneName(token.mapID)
  return zone and (zone .. " " .. coords(token.x, token.y)) or coords(token.x, token.y)
end

-- Name and link the game has right now; nil while it is still loading.
local resolvers = {
  item = function(id)
    if not C_Item or not C_Item.GetItemInfo then
      return nil
    end
    local name, link = ns.Call(C_Item.GetItemInfo, id)
    if type(name) == "string" and type(link) == "string" then
      return name, link
    end
  end,
  quest = function(id)
    local title = C_QuestLog and C_QuestLog.GetTitleForQuestID and ns.Call(C_QuestLog.GetTitleForQuestID, id)
    if type(title) == "string" and title ~= "" then
      return title, string.format("|cffffff00|Hquest:%d:-1|h[%s]|h|r", id, title)
    end
  end,
  ach = function(id)
    local link = GetAchievementLink and ns.Call(GetAchievementLink, id)
    if type(link) == "string" then
      return link:match("|h%[(.-)%]|h") or "", link
    end
  end,
  spell = function(id)
    local link = C_Spell and C_Spell.GetSpellLink and ns.Call(C_Spell.GetSpellLink, id)
    if type(link) == "string" then
      return link:match("|h%[(.-)%]|h") or "", link
    end
  end,
  currency = function(id)
    local link = C_CurrencyInfo and C_CurrencyInfo.GetCurrencyLink and ns.Call(C_CurrencyInfo.GetCurrencyLink, id, 0)
    if type(link) == "string" then
      return link:match("|h%[(.-)%]|h") or "", link
    end
  end,
}

-- Ask the game to load a name; calls back once it is there.
local loaders = {
  item = function(id, done)
    if Item and Item.CreateFromItemID then
      local item = ns.Call(Item.CreateFromItemID, Item, id)
      if item and item.ContinueOnItemLoad and not (item.IsItemEmpty and item:IsItemEmpty()) then
        pcall(item.ContinueOnItemLoad, item, done)
        return true
      end
    end
  end,
  quest = function(id, done)
    if QuestEventListener and QuestEventListener.AddCallback then
      pcall(QuestEventListener.AddCallback, QuestEventListener, id, done)
      return true
    end
    if C_QuestLog and C_QuestLog.RequestLoadQuestByID then
      pcall(C_QuestLog.RequestLoadQuestByID, id)
      return true
    end
  end,
  spell = function(id, done)
    if C_Spell and C_Spell.DoesSpellExist and not ns.Call(C_Spell.DoesSpellExist, id) then
      return false
    end
    if Spell and Spell.CreateFromSpellID then
      local spell = ns.Call(Spell.CreateFromSpellID, Spell, id)
      if spell and spell.ContinueOnSpellLoad then
        pcall(spell.ContinueOnSpellLoad, spell, done)
        return true
      end
    end
  end,
}

M.asked = {}
M.failed = {}

local function clock()
  return (GetTime and GetTime()) or ns.Now()
end

local function giveUp(key, kind, id)
  if M.failed[key] then
    return
  end
  M.failed[key] = true
  if ns.Snapshot and ns.Snapshot.NoteUnresolved then
    ns.Snapshot.NoteUnresolved(kind, id)
  end
end

-- One token as Bubble text: a link when the game knows it, the label while it
-- loads, and the label as plain text once it gave up (D74).
local function renderToken(token, npcs, onChange)
  if token.type == "pin" then
    return string.format(
      "|cff66ccff|H%spin:%d:%s:%s|h[%s]|h|r",
      LINK_PREFIX,
      token.mapID,
      tostring(token.x),
      tostring(token.y),
      pinText(token)
    )
  end
  if token.type == "npc" then
    local entry = type(npcs) == "table" and npcs[tostring(token.id)] or nil
    local name = token.label or (entry and entry.name)
    if not name then
      return ""
    end
    return string.format("|cffffd100|H%snpc:%d|h[%s]|h|r", LINK_PREFIX, token.id, name)
  end
  local key = token.type .. ":" .. token.id
  local name, link = resolvers[token.type](token.id)
  if link then
    M.asked[key] = nil
    return link
  end
  local fallback = token.label or ""
  if M.failed[key] then
    return fallback
  end
  local first = M.asked[key]
  if not first then
    M.asked[key] = clock()
    local loader = loaders[token.type]
    local waiting = loader and loader(token.id, function()
      if onChange then
        onChange()
      end
    end)
    if not waiting then
      giveUp(key, token.type, token.id)
      return fallback
    end
    if onChange and C_Timer and C_Timer.After then
      C_Timer.After(M.LOAD_SECONDS + 0.1, onChange)
    end
  elseif clock() - first >= M.LOAD_SECONDS then
    giveUp(key, token.type, token.id)
  end
  return name or fallback
end

-- Text for the Bubble, with links. onChange is called when a name loads.
function M.Render(text, npcs, onChange)
  if type(text) ~= "string" or not M.HasTokens(text) then
    return text
  end
  local out = {}
  for _, part in ipairs(M.Parse(text)) do
    out[#out + 1] = type(part) == "table" and renderToken(part, npcs, onChange) or part
  end
  return (table.concat(out):gsub("  +", " "))
end

-- Text without links (tracker, chat, uploads): game names when cached, else labels.
function M.Plain(text, npcs)
  if type(text) ~= "string" or not M.HasTokens(text) then
    return text
  end
  local out = {}
  for _, part in ipairs(M.Parse(text)) do
    if type(part) == "string" then
      out[#out + 1] = part
    elseif part.type == "pin" then
      out[#out + 1] = pinText(part)
    elseif part.type == "npc" then
      local entry = type(npcs) == "table" and npcs[tostring(part.id)] or nil
      out[#out + 1] = part.label or (entry and entry.name) or ""
    else
      local name = resolvers[part.type](part.id)
      out[#out + 1] = (name ~= "" and name) or part.label or ""
    end
  end
  return ns.Trim((table.concat(out):gsub("  +", " ")))
end

-- Our own links: addon:Unbored:npc:ID and addon:Unbored:pin:MAP:X:Y.
local function readOwn(link)
  if type(link) ~= "string" or link:sub(1, #LINK_PREFIX) ~= LINK_PREFIX then
    return nil
  end
  local rest = link:sub(#LINK_PREFIX + 1)
  local id = rest:match("^npc:(%d+)$")
  if id then
    return { type = "npc", id = tonumber(id) }
  end
  local mapID, x, y = rest:match("^pin:(%d+):([%d%.]+):([%d%.]+)$")
  if mapID then
    return { type = "pin", mapID = tonumber(mapID), x = tonumber(x), y = tonumber(y) }
  end
  return { type = "unknown" }
end

-- Where an npc link points: the entity of the current Step or answer.
M.npcs = nil

function M.UseNpcs(npcs)
  M.npcs = npcs
end

local function place(own)
  if own.type == "pin" then
    return own.mapID, own.x, own.y, nil
  end
  local entry = own.type == "npc" and type(M.npcs) == "table" and M.npcs[tostring(own.id)] or nil
  if entry then
    return entry.mapID, entry.x, entry.y, entry.name
  end
end

function M.OnEnter(owner, link, text)
  if not GameTooltip then
    return
  end
  local own = readOwn(link)
  GameTooltip:SetOwner(owner, "ANCHOR_CURSOR")
  if not own then
    pcall(GameTooltip.SetHyperlink, GameTooltip, link)
    GameTooltip:Show()
    return
  end
  local mapID, x, y, name = place(own)
  local title = name or (type(text) == "string" and text:match("%[(.-)%]")) or ns.MASCOT_NAME
  GameTooltip:AddLine(title, 1, 0.82, 0)
  local zone = zoneName(mapID)
  if zone then
    GameTooltip:AddLine(zone, 1, 1, 1)
  end
  if x and y then
    GameTooltip:AddLine(coords(x, y), 0.8, 0.8, 0.8)
    GameTooltip:AddLine(ns.T("LINK_SET_WAYPOINT"), 0.3, 0.85, 0.85)
  end
  GameTooltip:Show()
end

function M.OnLeave()
  if GameTooltip then
    GameTooltip:Hide()
  end
end

-- Returns true when it was one of ours.
function M.OnClick(link, text, button)
  local own = readOwn(link)
  if not own then
    if SetItemRef then
      pcall(SetItemRef, link, text, button)
    end
    return false
  end
  local mapID, x, y, name = place(own)
  if mapID and x and y then
    local title = name or (type(text) == "string" and text:match("%[(.-)%]")) or nil
    ns.Waypoint:Point(mapID, x / 100, y / 100, title)
  end
  return true
end

-- Our links clicked anywhere else (a chat line, another addon's frame).
function M.Hook()
  if M.hooked or not EventRegistry or not EventRegistry.RegisterCallback then
    return
  end
  M.hooked = true
  EventRegistry:RegisterCallback("SetItemRef", function(_, link, text, button)
    if readOwn(link) then
      M.OnClick(link, text, button)
    end
  end, M)
end
