-- Interface boundaries, including newer GetBuildInfo return values.
for _, interface in ipairs({ 15999, 16000, 16001, 16999, 17000, 120107 }) do
  local sandbox = setmetatable({ GetBuildInfo = function()
    return "test", "test", "", interface, "extra"
  end }, { __index = _G })
  local namespace = assert(loadfile("Core/Namespace.lua"))
  setfenv(namespace, sandbox)
  local ns = {}
  namespace("Unbored", ns)
  assert(ns.Game == (interface >= 16000 and interface < 17000 and "forever" or "retail"))
end

-- Reuse the frame harness, replacing its client APIs before loading the full TOC.
-- The client fixture exercises profession Sections through login/window reads,
-- including both recipe enumerators, secrets, combat and unavailable APIs.
assert(loadfile("tests/ui.lua"))("forever")
