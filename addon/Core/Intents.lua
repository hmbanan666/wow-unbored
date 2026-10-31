-- Text helpers for Answers from the Planner: the language of a line and the
-- split into at most three bubbles. The local question answers went with
-- Ask (docs/adr/0046).

local _, ns = ...

ns.Intents = {}

local MAX_BUBBLES = 3

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
