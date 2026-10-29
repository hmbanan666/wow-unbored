-- Local answers to common questions (docs/adr/0014): what to do here,
-- achievements here, rares here, collectibles. Answered at once from the
-- Providers, in the language of the question, in up to three bubbles.

local _, ns = ...

ns.Intents = {}

local LISTED = 4
local MAX_BUBBLES = 3

-- Lowercase keyword stems; the question is lowercased first. First match wins.
ns.Intents.KEYWORDS = {
  { id = "achievements", words = { "achiev", "ачив", "достижен" } },
  { id = "rares", words = { "rare", "treasure", "редк", "рарник", "сокровищ", "клад" } },
  {
    id = "collect",
    words = { "collect", "mount", "pet", "toy", "transmog", "коллекц", "маунт", "питом", "игрушк", "трансмог",
      "собрать" },
  },
  {
    id = "here",
    words = { "what to do", "what can i do", "what should i do", "nearby", "around here", "bored",
      "чем заняться", "что делать", "что поделать", "чем бы", "рядом", "скучно" },
  },
}

-- ASCII lower, plus Cyrillic А-Я and Ё (two-byte UTF-8).
function ns.Intents.Lower(text)
  text = tostring(text or ""):lower()
  text = text:gsub("\208([\144-\159])", function(c)
    return "\208" .. string.char(c:byte() + 32)
  end)
  text = text:gsub("\208([\160-\175])", function(c)
    return "\209" .. string.char(c:byte() - 32)
  end)
  return (text:gsub("\208\129", "\209\145"))
end

function ns.Intents.Lang(text)
  if type(text) == "string" and text:find("[\208\209][\128-\191]") then
    return "ru"
  end
  return "en"
end

function ns.Intents.Detect(text)
  local lower = ns.Intents.Lower(text)
  if lower == "" then
    return nil
  end
  for i = 1, #ns.Intents.KEYWORDS do
    local row = ns.Intents.KEYWORDS[i]
    for j = 1, #row.words do
      if lower:find(row.words[j], 1, true) then
        return row.id
      end
    end
  end
  return nil
end

local function build(mode)
  local ctx = ns.BuildContext(240)
  local tasks = ns.Providers[mode] and ns.BuildProviderPlan(mode, ctx) or nil
  return type(tasks) == "table" and tasks or {}, ctx
end

local function pick(tasks, keep)
  local out = {}
  for i = 1, #tasks do
    if keep(tasks[i]) then
      out[#out + 1] = tasks[i]
    end
  end
  return out
end

local function isAchievement(task)
  local id = tostring(task.id or "")
  return id:find("^roam:%d") ~= nil or id:find("^roam:achieve:") ~= nil
end

local function isRare(task)
  local id = tostring(task.id or "")
  return id:find("^roam:vignette:") ~= nil or id:find("^rare") ~= nil
end

local SOURCES = {
  here = function()
    local roam = build("roam")
    local quests = build("quests")
    for i = 1, #quests do
      roam[#roam + 1] = quests[i]
    end
    return roam, "INTENT_HERE"
  end,
  achievements = function()
    local roam, ctx = build("roam")
    local found = pick(roam, isAchievement)
    local fun = build("fun")
    for i = 1, #fun do
      if fun[i].mapID and fun[i].mapID == ctx.mapID then
        found[#found + 1] = fun[i]
      end
    end
    return found, "INTENT_ACHIEVEMENTS"
  end,
  rares = function()
    return pick((build("roam")), isRare), "INTENT_RARES"
  end,
  collect = function()
    return (build("farm")), "INTENT_COLLECT"
  end,
}

-- { intent, lang, messages = { up to 3 }, tasks = { up to MAX_STEPS } }
function ns.Intents.Answer(intent, lang)
  local source = SOURCES[intent]
  if not source then
    return nil
  end
  lang = lang or ns.LANG or "en"
  local ok, tasks, header = pcall(source)
  if not ok or type(tasks) ~= "table" then
    tasks, header = {}, nil
  end
  if #tasks == 0 then
    return { intent = intent, lang = lang, messages = { ns.TL(lang, "INTENT_NONE") }, tasks = {} }
  end
  local lines = { ns.TL(lang, header) }
  for i = 1, math.min(#tasks, LISTED) do
    lines[#lines + 1] = "- " .. tostring(tasks[i].title or "")
  end
  local messages = { table.concat(lines, "\n") }
  if #tasks > LISTED then
    messages[#messages + 1] = ns.TL(lang, "INTENT_MORE", #tasks - LISTED)
  end
  while #messages > MAX_BUBBLES do
    table.remove(messages)
  end
  local plan = {}
  for i = 1, math.min(#tasks, ns.MAX_STEPS) do
    plan[i] = tasks[i]
  end
  return { intent = intent, lang = lang, messages = messages, tasks = plan }
end

-- An Answer's text split on blank lines into at most three bubbles.
function ns.Intents.Split(text)
  local out = {}
  text = tostring(text or ""):gsub("\r", "")
  for part in (text .. "\n\n"):gmatch("(.-)\n%s*\n") do
    part = ns.Trim(part)
    if part ~= "" then
      out[#out + 1] = part
    end
  end
  if #out == 0 then
    return { ns.Trim(text) }
  end
  while #out > MAX_BUBBLES do
    out[MAX_BUBBLES] = out[MAX_BUBBLES] .. "\n\n" .. table.remove(out, MAX_BUBBLES + 1)
  end
  return out
end
