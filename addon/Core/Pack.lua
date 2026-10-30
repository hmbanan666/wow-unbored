-- Packed id sets (docs/adr/0028, docs/contract/README.md): a big list of ids
-- as a few strings instead of thousands of numeric literals, so SavedVariables
-- stay far from the 262,144 unique literal limit.
-- Format: { "ids1", "<chunk>", ... }. Ids are unique, sorted ascending, the
-- first written as is and every next one as the gap to the previous, each in
-- lowercase base36, joined by ",". Chunks split only between numbers and hold
-- at most 4,000 characters; joining them with "," gives the whole list.
-- { "idv1", ... } is the same with whole-number values after each id
-- ("<gap>:<value>:<value>"), for item counts and similar per-id numbers.

local _, ns = ...

ns.Pack = {}

ns.Pack.TAG = "ids1"
ns.Pack.VALUES_TAG = "idv1"
ns.Pack.CHUNK = 4000

local DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"

local function base36(n)
  if n == 0 then
    return "0"
  end
  local out = {}
  while n > 0 do
    local digit = n % 36
    out[#out + 1] = DIGITS:sub(digit + 1, digit + 1)
    n = (n - digit) / 36
  end
  return string.reverse(table.concat(out))
end

local function cleanIds(ids)
  local seen, list = {}, {}
  if type(ids) ~= "table" then
    return list
  end
  for _, value in pairs(ids) do
    local id = ns.AsNumber(value)
    if id and id >= 0 and id == math.floor(id) and not seen[id] then
      seen[id] = true
      list[#list + 1] = id
    end
  end
  table.sort(list)
  return list
end

local function chunked(tag, list, wordFor)
  local out = { tag }
  local chunk, length, previous = {}, 0, 0
  for i = 1, #list do
    local word = wordFor(list[i], list[i] - previous)
    previous = list[i]
    local extra = #word + (#chunk > 0 and 1 or 0)
    if #chunk > 0 and length + extra > ns.Pack.CHUNK then
      out[#out + 1] = table.concat(chunk, ",")
      chunk, length, extra = {}, 0, #word
    end
    chunk[#chunk + 1] = word
    length = length + extra
  end
  if #chunk > 0 then
    out[#out + 1] = table.concat(chunk, ",")
  end
  return out
end

function ns.Pack.Encode(ids)
  return chunked(ns.Pack.TAG, cleanIds(ids), function(_, gap)
    return base36(gap)
  end)
end

local function wholeNumber(value)
  value = ns.AsNumber(value)
  if not value or value < 0 then
    return 0
  end
  return math.floor(value)
end

-- rows: { [id] = value } or { [id] = { value, value, ... } }.
function ns.Pack.EncodeValues(rows)
  local ids = {}
  for id in pairs(type(rows) == "table" and rows or {}) do
    ids[#ids + 1] = id
  end
  return chunked(ns.Pack.VALUES_TAG, cleanIds(ids), function(id, gap)
    local values = rows[id]
    if type(values) ~= "table" then
      values = { values }
    end
    local words = { base36(gap) }
    for i = 1, #values do
      words[#words + 1] = base36(wholeNumber(values[i]))
    end
    return table.concat(words, ":")
  end)
end

function ns.Pack.IsPacked(value)
  return type(value) == "table" and (value[1] == ns.Pack.TAG or value[1] == ns.Pack.VALUES_TAG)
end

-- Calls fn(id, value, value, ...) for every row of an "idv1" set.
function ns.Pack.EachValues(packed, fn)
  if type(packed) ~= "table" or packed[1] ~= ns.Pack.VALUES_TAG then
    return false
  end
  local previous = 0
  for i = 2, #packed do
    local chunk = packed[i]
    if type(chunk) == "string" then
      for word in chunk:gmatch("[^,]+") do
        local values = {}
        for part in word:gmatch("[^:]+") do
          values[#values + 1] = tonumber(part, 36)
        end
        if values[1] then
          previous = previous + values[1]
          fn(previous, unpack(values, 2))
        end
      end
    end
  end
  return true
end

-- { [id] = { value, ... } } from an "idv1" set.
function ns.Pack.DecodeValues(packed)
  local out = {}
  ns.Pack.EachValues(packed, function(id, ...)
    out[id] = { ... }
  end)
  return out
end

-- Calls fn(id) for every id, in order. False when the value is not a set.
function ns.Pack.Each(packed, fn)
  if not ns.Pack.IsPacked(packed) then
    return false
  end
  local previous = 0
  for i = 2, #packed do
    local chunk = packed[i]
    if type(chunk) == "string" then
      for word in chunk:gmatch("[^,]+") do
        local gap = tonumber(word:match("^[^:]+") or "", 36)
        if gap then
          previous = previous + gap
          fn(previous)
        end
      end
    end
  end
  return true
end

function ns.Pack.Decode(packed)
  local out = {}
  ns.Pack.Each(packed, function(id)
    out[#out + 1] = id
  end)
  return out
end

-- { [id] = true }, for quick lookups such as "has this quest been done".
function ns.Pack.Set(packed)
  local out = {}
  ns.Pack.Each(packed, function(id)
    out[id] = true
  end)
  return out
end

function ns.Pack.Count(packed)
  local count = 0
  ns.Pack.Each(packed, function()
    count = count + 1
  end)
  return count
end

-- A packed set plus one more id (event deltas such as QUEST_TURNED_IN).
function ns.Pack.Add(packed, id)
  id = ns.AsNumber(id)
  if not id then
    return packed
  end
  local list = ns.Pack.Decode(packed)
  list[#list + 1] = id
  return ns.Pack.Encode(list)
end
