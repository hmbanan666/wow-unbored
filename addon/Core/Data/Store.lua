-- The Game data snapshot (docs/adr/0027, 0028): every own-player source the
-- game gives us, as versioned Sections in UnboredCharDB.data (this Character)
-- and UnboredDB.data (the Account). Each collector in Core/Data/ registers one
-- or more Sections here. Reads happen at three moments only (D49): a staged
-- login pass 10 s after entering the world, settled event deltas, and while a
-- window such as the bank is open. Nothing is read in combat, logout only
-- stamps time, and any secret value is dropped before it is stored.

local _, ns = ...

ns.Snapshot = {
  defs = {},
  order = {},
  byEvent = {},
  dirty = {},
  queue = {},
  open = {},
}

local S = ns.Snapshot

S.SCHEMA = 2
S.LOGIN_DELAY = 10
S.SETTLE_SECONDS = 2
S.BUDGET_MS = 4
S.TARGET_BYTES = { char = 400 * 1024, account = 300 * 1024 }
S.CAP_BYTES = 1024 * 1024
S.MAX_LITERALS = 30000
-- With sharing off only what a Plan Request needs is written (D62).
S.ESSENTIAL = { char = true, gear = true, questLog = true, sessions = true }

local function isSecret(value)
  if type(issecretvalue) ~= "function" then
    return false
  end
  local ok, secret = pcall(issecretvalue, value)
  return not ok or secret and true or false
end

-- A copy that keeps only plain data: secret values, functions, NaN and
-- infinities are left out, and so is anything nested too deep.
local function clean(value, depth)
  if isSecret(value) then
    return nil
  end
  local kind = type(value)
  if kind == "string" or kind == "boolean" then
    return value
  end
  if kind == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      return nil
    end
    return value
  end
  if kind ~= "table" then
    return nil
  end
  depth = (depth or 0) + 1
  if depth > 10 then
    return nil
  end
  local out = {}
  for key, item in pairs(value) do
    if not isSecret(key) and (type(key) == "string" or type(key) == "number") then
      local copied = clean(item, depth)
      if copied ~= nil then
        out[key] = copied
      end
    end
  end
  return out
end
S.Clean = clean

local function root(scope)
  local holder
  if scope == "account" then
    if type(UnboredDB) ~= "table" then
      UnboredDB = {}
    end
    holder = UnboredDB
  else
    if type(UnboredCharDB) ~= "table" then
      UnboredCharDB = {}
    end
    holder = UnboredCharDB
  end
  local data = holder.data
  if type(data) ~= "table" or data.schema ~= S.SCHEMA then
    data = { schema = S.SCHEMA, sections = {} }
    holder.data = data
  end
  if type(data.sections) ~= "table" then
    data.sections = {}
  end
  return data, holder
end
S.Root = root

function S.Sharing()
  return not (ns.DB and ns.DB.shareData == false)
end

function S.Allowed(name)
  return S.ESSENTIAL[name] or S.Sharing()
end

-- def: name, scope ("char" or "account"), v, prio (lower is dropped first),
-- read(previousBody) -> body or nil, events, window (only while open),
-- login (default true), every (seconds between login reads), delay
-- (seconds after the login pass), delta(body, event, ...) -> body.
function S.Register(def)
  def.scope = def.scope or "char"
  def.v = def.v or 1
  def.prio = def.prio or 50
  if def.login == nil then
    def.login = true
  end
  if not S.defs[def.name] then
    S.order[#S.order + 1] = def.name
  end
  S.defs[def.name] = def
  local events = {}
  for _, list in ipairs({ def.events or {}, def.opens or {}, def.closes or {} }) do
    for i = 1, #list do
      events[list[i]] = true
    end
  end
  for event in pairs(events) do
    S.byEvent[event] = S.byEvent[event] or {}
    table.insert(S.byEvent[event], def.name)
  end
end

local function contains(list, value)
  for i = 1, #(list or {}) do
    if list[i] == value then
      return true
    end
  end
  return false
end

-- True while the window a Section needs (bank, profession) is open.
function S.IsOpen(name)
  return S.open[name] == true
end

function S.Get(name)
  local def = S.defs[name]
  local data = root(def and def.scope or "char")
  local section = data.sections[name]
  return type(section) == "table" and section or nil
end

function S.Body(name)
  local section = S.Get(name)
  return section and section.body or nil
end

-- Stores one Section. A read that came back empty never replaces data.
function S.Write(name, body, src)
  local def = S.defs[name]
  if not def or not S.Allowed(name) then
    return false
  end
  body = clean(body)
  if type(body) ~= "table" or next(body) == nil then
    return false
  end
  local data = root(def.scope)
  data.sections[name] = { v = def.v, at = ns.Now(), src = src or "event", body = body }
  if type(data.dropped) == "table" then
    data.dropped[name] = nil
    if next(data.dropped) == nil then
      data.dropped = nil
    end
  end
  return true
end

function S.Read(name, src)
  local def = S.defs[name]
  if not def or not S.Allowed(name) then
    return false
  end
  if ns.IsCombat() then
    S.dirty[name] = src or "event"
    return false
  end
  local previous = S.Body(name)
  local ok, body = pcall(def.read, previous)
  if not ok then
    ns.ReportError(body)
    return false
  end
  return S.Write(name, body, src)
end

-- Inside a staged read: hands the frame back once the budget is spent.
function S.Yield()
  local co = coroutine.running()
  if not co or co ~= S.co then
    return
  end
  if S.Elapsed() >= S.BUDGET_MS or ns.IsCombat() then
    coroutine.yield()
  end
end

local function clockMs()
  if type(debugprofilestop) == "function" then
    local ok, value = pcall(debugprofilestop)
    if ok and type(value) == "number" then
      return value
    end
  end
  return os.clock() * 1000
end

function S.Elapsed()
  return clockMs() - (S.stepStart or clockMs())
end

local function enqueue(name, src)
  for i = 1, #S.queue do
    if S.queue[i].name == name then
      return
    end
  end
  S.queue[#S.queue + 1] = { name = name, src = src }
end

local function worker()
  while #S.queue > 0 do
    local job = table.remove(S.queue, 1)
    S.Read(job.name, job.src)
    if job.after then
      pcall(job.after)
    end
    S.Yield()
  end
end

-- One frame of staged work. True while there is more to do.
function S.Step(unbounded)
  if ns.IsCombat() then
    return #S.queue > 0 or S.co ~= nil
  end
  if not S.co then
    if #S.queue == 0 then
      return false
    end
    S.co = coroutine.create(worker)
  end
  S.stepStart = unbounded and clockMs() + 1e12 or clockMs()
  local ok, err = coroutine.resume(S.co)
  if not ok then
    ns.ReportError(err)
    S.co = nil
    S.queue = {}
    return false
  end
  if coroutine.status(S.co) == "dead" then
    S.co = nil
    if #S.queue == 0 then
      S.Enforce()
      return false
    end
  end
  return true
end

-- Runs everything queued at once (tests, and nothing else).
function S.Drain()
  local guard = 0
  while S.Step(true) and guard < 100000 do
    guard = guard + 1
  end
end

local function startRunner()
  if not CreateFrame then
    return
  end
  if not S.frame then
    S.frame = CreateFrame("Frame")
  end
  S.frame:SetScript("OnUpdate", function(frame)
    local ok, more = pcall(S.Step)
    if not ok or not more then
      frame:SetScript("OnUpdate", nil)
    end
  end)
end

function S.Queue(name, src)
  if not S.defs[name] or not S.Allowed(name) then
    return
  end
  enqueue(name, src)
  startRunner()
end

local function due(def)
  if not def.every then
    return true
  end
  local body = S.Body(def.name)
  local last = type(body) == "table" and tonumber(body.scannedAt) or nil
  return not last or ns.Now() - last >= def.every
end

function S.LoginPass()
  S.loginDone = true
  for i = 1, #S.order do
    local def = S.defs[S.order[i]]
    if def.login and not def.window and due(def) then
      if def.delay and C_Timer and C_Timer.After then
        local name = def.name
        pcall(C_Timer.After, def.delay, function()
          S.Queue(name, def.every and "daily" or "login")
        end)
      else
        S.Queue(def.name, def.every and "daily" or "login")
      end
    end
  end
  S.ApplySharing()
end

function S.OnEnteringWorld()
  if S.loginScheduled then
    return
  end
  S.loginScheduled = true
  for i = 1, #S.order do
    local def = S.defs[S.order[i]]
    if def.prepare then
      pcall(def.prepare)
    end
  end
  if C_Timer and C_Timer.After then
    pcall(C_Timer.After, S.LOGIN_DELAY, S.LoginPass)
  else
    S.LoginPass()
  end
end

function S.Mark(name, src)
  if S.dirty[name] == nil then
    S.dirty[name] = src or "event"
  end
  S.dirtyAt = S.dirtyAt or ns.Now()
end

-- From the ticker: queues what changed once a burst has settled.
function S.Pulse()
  if next(S.dirty) == nil or ns.IsCombat() then
    return false
  end
  if ns.Now() - (S.dirtyAt or 0) < S.SETTLE_SECONDS then
    return false
  end
  local dirty = S.dirty
  S.dirty, S.dirtyAt = {}, nil
  for i = 1, #S.order do
    local name = S.order[i]
    if dirty[name] then
      S.Queue(name, dirty[name])
    end
  end
  return true
end

function S.OnEvent(event, ...)
  if event == "PLAYER_LOGOUT" then
    S.Logout()
    return
  end
  local names = S.byEvent[event]
  if not names then
    return
  end
  for i = 1, #names do
    local def = S.defs[names[i]]
    if contains(def.closes, event) then
      S.open[def.name] = nil
    elseif contains(def.opens, event) then
      S.open[def.name] = true
    end
    if def.onEvent then
      pcall(def.onEvent, event, ...)
    elseif def.delta and contains(def.events, event) then
      local ok, body = pcall(def.delta, S.Body(def.name), event, ...)
      if ok and body then
        S.Write(def.name, body, "event")
      end
    elseif def.window then
      if S.open[def.name] and not contains(def.closes, event) then
        S.Mark(def.name, "window")
      end
    elseif S.loginDone and contains(def.events, event) then
      S.Mark(def.name, "event")
    end
  end
end

function S.Events()
  local out = { "PLAYER_LOGOUT" }
  for event in pairs(S.byEvent) do
    out[#out + 1] = event
  end
  return out
end

-- Logout reads come back empty (D37), so only pure-Lua stamps happen here.
function S.Logout()
  for i = 1, #S.order do
    local def = S.defs[S.order[i]]
    if def.logout then
      pcall(def.logout)
    end
  end
  S.ApplySharing()
  S.Enforce()
end

-- Sharing off: everything but the essential Sections goes.
function S.ApplySharing()
  if S.Sharing() then
    return
  end
  for _, scope in ipairs({ "char", "account" }) do
    local data = root(scope)
    for name in pairs(data.sections) do
      if not S.ESSENTIAL[name] then
        data.sections[name] = nil
      end
    end
  end
end

-- Size of a value as the game writes it to SavedVariables, roughly, and the
-- unique string and number literals it adds to that file.
function S.Measure(value)
  local literals, count = {}, 0
  local function literal(v)
    local key = type(v) == "number" and ("n" .. tostring(v)) or ("s" .. tostring(v))
    if not literals[key] then
      literals[key] = true
      count = count + 1
    end
  end
  local function size(v, depth)
    local kind = type(v)
    if kind == "string" then
      literal(v)
      return #v + 2
    elseif kind == "number" then
      literal(v)
      return #tostring(v)
    elseif kind == "boolean" then
      return v and 4 or 5
    elseif kind ~= "table" then
      return 3
    end
    local bytes = 3 + depth
    for key, item in pairs(v) do
      local keyBytes
      if type(key) == "number" then
        literal(key)
        keyBytes = #tostring(key) + 2
      else
        literal(key)
        keyBytes = #tostring(key) + 4
      end
      bytes = bytes + depth + 1 + keyBytes + 3 + size(item, depth + 1) + 2
    end
    return bytes
  end
  local bytes = size(value, 0)
  return bytes, count
end

-- Over the cap, the lowest priority Sections go first; each is recorded in
-- `dropped` so the Server and the owner see what is missing and why (D54).
function S.Enforce()
  for _, scope in ipairs({ "char", "account" }) do
    local data, holder = root(scope)
    local bytes, literals = S.Measure(holder)
    if bytes > S.CAP_BYTES or literals >= S.MAX_LITERALS then
      local names = {}
      for name in pairs(data.sections) do
        if not S.ESSENTIAL[name] then
          names[#names + 1] = name
        end
      end
      table.sort(names, function(a, b)
        local pa = S.defs[a] and S.defs[a].prio or 0
        local pb = S.defs[b] and S.defs[b].prio or 0
        if pa == pb then
          return a < b
        end
        return pa < pb
      end)
      for i = 1, #names do
        if bytes <= S.CAP_BYTES and literals < S.MAX_LITERALS then
          break
        end
        local sectionBytes = S.Measure(data.sections[names[i]])
        data.sections[names[i]] = nil
        data.dropped = type(data.dropped) == "table" and data.dropped or {}
        data.dropped[names[i]] = { at = ns.Now(), bytes = sectionBytes }
        bytes, literals = S.Measure(holder)
      end
    end
  end
end
