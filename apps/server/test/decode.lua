local unb1 = arg[1]
local root = arg[2]
local ns = {}

local function load(path)
  local chunk, err = loadfile(root .. "/" .. path)
  if not chunk then
    error(err)
  end
  chunk("Unbored", ns)
end

load("Core/Namespace.lua")
load("Core/Locale.lua")
load("Core/Codec.lua")
load("Core/Markup.lua")
load("Core/Import.lua")

local plan, err = ns.DecodeImport(unb1)
if not plan then
  io.stderr:write(tostring(err) .. "\n")
  os.exit(1)
end

io.write(plan.tasks[1].id .. "\n")
io.write(plan.tasks[1].title .. "\n")
io.write((plan.tasks[1].note or "") .. "\n")
io.write(tostring(plan.tasks[2] and plan.tasks[2].mapID or "") .. "\n")
io.write(tostring(plan.budget) .. "\n")
