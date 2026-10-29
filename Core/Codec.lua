-- UNB1 plan strings: prefix + standard base64 of UTF-8 JSON.
-- No LibDeflate. An outside planner can build this with any JSON and base64.
-- See docs/plan-format.md.

local _, ns = ...

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64_INDEX = {}
for i = 1, #B64 do
  B64_INDEX[B64:sub(i, i)] = i - 1
end

function ns.Base64Encode(data)
  if type(data) ~= "string" then
    return nil
  end
  local out = {}
  local len = #data
  local i = 1
  while i <= len do
    local a = data:byte(i)
    local b = (i + 1 <= len) and data:byte(i + 1) or 0
    local c = (i + 2 <= len) and data:byte(i + 2) or 0
    local n = a * 65536 + b * 256 + c
    local c1 = math.floor(n / 262144) % 64
    local c2 = math.floor(n / 4096) % 64
    local c3 = math.floor(n / 64) % 64
    local c4 = n % 64
    out[#out + 1] = B64:sub(c1 + 1, c1 + 1)
    out[#out + 1] = B64:sub(c2 + 1, c2 + 1)
    if i + 1 <= len then
      out[#out + 1] = B64:sub(c3 + 1, c3 + 1)
    else
      out[#out + 1] = "="
    end
    if i + 2 <= len then
      out[#out + 1] = B64:sub(c4 + 1, c4 + 1)
    else
      out[#out + 1] = "="
    end
    i = i + 3
  end
  return table.concat(out)
end

function ns.Base64Decode(data)
  if type(data) ~= "string" then
    return nil, "base64"
  end
  data = data:gsub("%s+", "")
  data = data:gsub("-", "+"):gsub("_", "/")
  if data == "" or data:find("[^A-Za-z0-9+/=]") then
    return nil, "base64"
  end
  local pad = #data % 4
  if pad > 0 then
    data = data .. string.rep("=", 4 - pad)
  end
  local out = {}
  for i = 1, #data, 4 do
    local c1 = data:sub(i, i)
    local c2 = data:sub(i + 1, i + 1)
    local c3 = data:sub(i + 2, i + 2)
    local c4 = data:sub(i + 3, i + 3)
    local v1, v2 = B64_INDEX[c1], B64_INDEX[c2]
    if not v1 or not v2 then
      return nil, "base64"
    end
    local v3 = c3 == "=" and 0 or B64_INDEX[c3]
    local v4 = c4 == "=" and 0 or B64_INDEX[c4]
    if v3 == nil or v4 == nil then
      return nil, "base64"
    end
    local n = v1 * 262144 + v2 * 4096 + v3 * 64 + v4
    out[#out + 1] = string.char(math.floor(n / 65536) % 256)
    if c3 ~= "=" then
      out[#out + 1] = string.char(math.floor(n / 256) % 256)
    end
    if c4 ~= "=" then
      out[#out + 1] = string.char(n % 256)
    end
  end
  return table.concat(out)
end

local function utf8encode(cp)
  if cp < 0 or cp > 0x10FFFF or (cp >= 0xD800 and cp <= 0xDFFF) then
    return "?"
  end
  if cp < 0x80 then
    return string.char(cp)
  end
  if cp < 0x800 then
    return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + (cp % 0x40))
  end
  if cp < 0x10000 then
    return string.char(
      0xE0 + math.floor(cp / 0x1000),
      0x80 + (math.floor(cp / 0x40) % 0x40),
      0x80 + (cp % 0x40)
    )
  end
  return string.char(
    0xF0 + math.floor(cp / 0x40000),
    0x80 + (math.floor(cp / 0x1000) % 0x40),
    0x80 + (math.floor(cp / 0x40) % 0x40),
    0x80 + (cp % 0x40)
  )
end

local function escapeString(text)
  return (text:gsub('[%z\1-\31\\"]', function(char)
    if char == '"' then return '\\"' end
    if char == "\\" then return "\\\\" end
    if char == "\b" then return "\\b" end
    if char == "\f" then return "\\f" end
    if char == "\n" then return "\\n" end
    if char == "\r" then return "\\r" end
    if char == "\t" then return "\\t" end
    return string.format("\\u%04x", char:byte())
  end))
end

local function isArray(value)
  local maxIndex = 0
  local count = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or key ~= math.floor(key) then
      return false
    end
    if key > maxIndex then
      maxIndex = key
    end
    count = count + 1
  end
  return count == maxIndex, maxIndex
end

local function encodeNumber(number)
  if number ~= number or number == math.huge or number == -math.huge then
    return nil, "number"
  end
  if number == math.floor(number) and math.abs(number) < 1e15 then
    return string.format("%d", number)
  end
  return tostring(number)
end

ns.JSON = {}

function ns.JSON.Encode(value)
  local nodes = 0
  local function encode(item, depth)
    nodes = nodes + 1
    if nodes > 4000 or depth > 8 then
      return nil, "limit"
    end
    if item == ns.JSON.Null then
      return "null"
    end
    local kind = type(item)
    if kind == "nil" then
      return "null"
    end
    if kind == "boolean" then
      return item and "true" or "false"
    end
    if kind == "number" then
      return encodeNumber(item)
    end
    if kind == "string" then
      return '"' .. escapeString(item) .. '"'
    end
    if kind ~= "table" then
      return nil, "type"
    end
    local array, count = isArray(item)
    if array then
      local parts = {}
      for i = 1, count do
        local encoded, err = encode(item[i], depth + 1)
        if not encoded then
          return nil, err
        end
        parts[#parts + 1] = encoded
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for key, itemValue in pairs(item) do
      if type(key) ~= "string" then
        return nil, "key"
      end
      if itemValue ~= nil then
        local encoded, err = encode(itemValue, depth + 1)
        if not encoded then
          return nil, err
        end
        parts[#parts + 1] = '"' .. escapeString(key) .. '":' .. encoded
      end
    end
    table.sort(parts)
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return encode(value, 0)
end

function ns.JSON.Decode(text)
  if type(text) ~= "string" then
    return nil, "json"
  end
  local i = 1
  local n = #text
  local nodes = 0

  local function peek()
    return text:sub(i, i)
  end

  local function skip()
    while i <= n do
      local c = text:sub(i, i)
      if c == " " or c == "\t" or c == "\n" or c == "\r" then
        i = i + 1
      else
        break
      end
    end
  end

  local parseValue

  local function parseString()
    if peek() ~= '"' then
      return nil, "string"
    end
    i = i + 1
    local out = {}
    while i <= n do
      local c = text:sub(i, i)
      if c == '"' then
        i = i + 1
        local value = table.concat(out)
        if #value > 2000 then
          return nil, "string"
        end
        return value
      end
      if c == "\\" then
        local esc = text:sub(i + 1, i + 1)
        if esc == '"' or esc == "\\" or esc == "/" then
          out[#out + 1] = esc
          i = i + 2
        elseif esc == "b" then
          out[#out + 1] = "\b"
          i = i + 2
        elseif esc == "f" then
          out[#out + 1] = "\f"
          i = i + 2
        elseif esc == "n" then
          out[#out + 1] = "\n"
          i = i + 2
        elseif esc == "r" then
          out[#out + 1] = "\r"
          i = i + 2
        elseif esc == "t" then
          out[#out + 1] = "\t"
          i = i + 2
        elseif esc == "u" then
          local hex = text:sub(i + 2, i + 5)
          if not hex:match("^%x%x%x%x$") then
            return nil, "string"
          end
          local cp = tonumber(hex, 16)
          i = i + 6
          if cp >= 0xD800 and cp <= 0xDBFF then
            local nextHex = text:sub(i + 2, i + 5)
            if text:sub(i, i + 1) == "\\u" and nextHex:match("^%x%x%x%x$") then
              local low = tonumber(nextHex, 16)
              if low >= 0xDC00 and low <= 0xDFFF then
                cp = 0x10000 + (cp - 0xD800) * 0x400 + (low - 0xDC00)
                i = i + 6
              end
            end
          end
          out[#out + 1] = utf8encode(cp)
        else
          return nil, "string"
        end
      else
        local byte = c:byte()
        if byte < 32 then
          return nil, "string"
        end
        out[#out + 1] = c
        i = i + 1
      end
    end
    return nil, "string"
  end

  local function parseNumber()
    local start = i
    if peek() == "-" then
      i = i + 1
    end
    if not peek():match("%d") then
      return nil, "number"
    end
    if peek() == "0" then
      i = i + 1
    else
      while peek():match("%d") do
        i = i + 1
      end
    end
    if peek() == "." then
      i = i + 1
      if not peek():match("%d") then
        return nil, "number"
      end
      while peek():match("%d") do
        i = i + 1
      end
    end
    if peek() == "e" or peek() == "E" then
      i = i + 1
      if peek() == "+" or peek() == "-" then
        i = i + 1
      end
      if not peek():match("%d") then
        return nil, "number"
      end
      while peek():match("%d") do
        i = i + 1
      end
    end
    local number = tonumber(text:sub(start, i - 1))
    if not number then
      return nil, "number"
    end
    return number
  end

  local function parseArray(depth)
    i = i + 1
    skip()
    local out = {}
    if peek() == "]" then
      i = i + 1
      return out
    end
    while true do
      local value, err = parseValue(depth + 1)
      if err then
        return nil, err
      end
      if value == nil then
        out[#out + 1] = ns.JSON.Null
      else
        out[#out + 1] = value
      end
      skip()
      if peek() == "]" then
        i = i + 1
        return out
      end
      if peek() ~= "," then
        return nil, "array"
      end
      i = i + 1
      skip()
    end
  end

  local function parseObject(depth)
    i = i + 1
    skip()
    local out = {}
    if peek() == "}" then
      i = i + 1
      return out
    end
    while true do
      skip()
      local key, keyErr = parseString()
      if not key then
        return nil, keyErr
      end
      skip()
      if peek() ~= ":" then
        return nil, "object"
      end
      i = i + 1
      local value, err = parseValue(depth + 1)
      if err then
        return nil, err
      end
      if value == nil then
        out[key] = ns.JSON.Null
      else
        out[key] = value
      end
      skip()
      if peek() == "}" then
        i = i + 1
        return out
      end
      if peek() ~= "," then
        return nil, "object"
      end
      i = i + 1
    end
  end

  parseValue = function(depth)
    nodes = nodes + 1
    if nodes > 4000 or depth > 8 then
      return nil, "limit"
    end
    skip()
    local c = peek()
    if c == '"' then
      return parseString()
    end
    if c == "{" then
      return parseObject(depth)
    end
    if c == "[" then
      return parseArray(depth)
    end
    if c == "-" or c:match("%d") then
      return parseNumber()
    end
    if text:sub(i, i + 3) == "true" then
      i = i + 4
      return true
    end
    if text:sub(i, i + 4) == "false" then
      i = i + 5
      return false
    end
    if text:sub(i, i + 3) == "null" then
      i = i + 4
      return nil
    end
    return nil, "value"
  end

  local value, err = parseValue(0)
  if err then
    return nil, err
  end
  skip()
  if i <= n then
    return nil, "trailing"
  end
  return value, nil
end

-- Marker stored for JSON null inside objects. Arrays keep real nil holes out.
ns.JSON.Null = setmetatable({}, { __tostring = function() return "null" end })

function ns.JSON.IsNull(value)
  return value == ns.JSON.Null
end

function ns.EncodeMessage(prefix, value)
  local raw, err = ns.JSON.Encode(value)
  if not raw then
    return nil, err
  end
  local encoded = ns.Base64Encode(raw)
  if not encoded then
    return nil, "base64"
  end
  return prefix .. ":" .. encoded
end

function ns.DecodeMessage(text)
  if type(text) ~= "string" then
    return nil, "empty"
  end
  text = text:gsub("%s+", "")
  if text == "" then
    return nil, "empty"
  end
  if #text > 20000 then
    return nil, "long"
  end
  local prefix, payload
  if text:sub(1, 6) == "UNB1P:" then
    prefix, payload = "UNB1P", text:sub(7)
  elseif text:sub(1, 5) == "UNB1:" then
    prefix, payload = "UNB1", text:sub(6)
  else
    return nil, "prefix"
  end
  local raw, berr = ns.Base64Decode(payload)
  if not raw then
    return nil, berr or "base64"
  end
  if #raw > 48000 then
    return nil, "long"
  end
  local value, jerr = ns.JSON.Decode(raw)
  if jerr or type(value) ~= "table" then
    return nil, "json"
  end
  return value, nil, prefix
end

local CODEC_ERRORS = {
  empty = "ERR_EMPTY",
  prefix = "ERR_PREFIX",
  base64 = "ERR_BASE64",
  json = "ERR_JSON",
  long = "ERR_LONG",
}

function ns.CodecError(code)
  local key = CODEC_ERRORS[code] or "ERR_JSON"
  return ns.T(key)
end
