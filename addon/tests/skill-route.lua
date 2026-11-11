local ns = {}
local combat = false
function InCombatLockdown() return combat end
function UnitName() return 'Hero' end
function GetRealmName() return 'Realm' end
function time() return 1000 end
for _, file in ipairs({ 'Namespace', 'Locale', 'Util', 'Pack', 'Data/Store', 'Markup',
  'Codec', 'Import', 'Plan', 'Complete', 'Steps', 'Outcome', 'Suggestions', 'Session' }) do
  assert(loadfile('Core/' .. file .. '.lua'))('Unbored', ns)
end
assert(loadfile('Core/Profile.lua'))('Unbored', ns)
ns.DB = {}; UnboredCharDB = {}; UnboredDB = ns.DB
ns.Snapshot.Register({ name = 'professions', games = { retail = true, forever = true } })
assert(loadfile('../packages/contracts/fixtures/profession-suggestions.lua'))()
for _, game in ipairs({ 'forever', 'retail' }) do
  ns.Game = game
  ns.Snapshot.Write('professions', { list = { { skillLine = 197, name = 'Tailoring', skill = 50, max = 75 } } })
  local rawPlan = UnboredSuggestions.characters['forever/Realm-Hero'][1].plan
  assert(ns.ValidatePlan(rawPlan, true).tasks[2].complete.kind == 'profession')
  local ideas = ns.Suggestions.Read()
  assert(#ideas == 1 and ideas[1].kind == 'profession' and ideas[1].quick)
  assert(ns.Suggestions.StillOpen(ideas[1]))
  assert(ns.Suggestions.Title(ideas[1]):find('50/75'))
  assert(#ideas[1].steps == 2)
  local task = ideas[1].steps[2]
  assert(not ns.IsTaskComplete(task))
  ns.Session:BeginSuggestion(ideas[1])
  assert(ns.Session:Current().id == 'train:100')
  assert(not ns.Session.state.quick and not UnboredCharDB.request)
  ns.Session:Done()
  assert(ns.Session:Current().id == 'craft:100:50')
  ns.Snapshot.Write('professions', { list = { { skillLine = 197, name = 'Tailoring', skill = 75, max = 75 } } })
  assert(ns.IsTaskComplete(task))
  ns.Session:CheckCurrent()
  assert(ns.Session:Current() == nil and #ns.Session.state.done == 2)
  assert(not ns.Suggestions.StillOpen(ideas[1]))
  combat = true; assert(not ns.IsTaskComplete(task)); combat = false
  ns.Snapshot.Write('professions', { list = {} })
  assert(not ns.Suggestions.StillOpen(ideas[1]))
end
print('Profession Steps and Ideas passed')
