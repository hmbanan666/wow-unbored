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

-- Every file the game loads before the decoder, in Unbored.toc order, so a new
-- dependency of Core/Import.lua is picked up here too.
local toc = assert(io.open(root .. "/Unbored.toc"))
for line in toc:lines() do
  local file = line:match("^%s*([^#%s][^%s]*%.lua)%s*$")
  if file then
    file = file:gsub("\\", "/")
    load(file)
    if file == "Core/Import.lua" then
      break
    end
  end
end
toc:close()
assert(ns.DecodeImport, "Core/Import.lua is missing from Unbored.toc")

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
