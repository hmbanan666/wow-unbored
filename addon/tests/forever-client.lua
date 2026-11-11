-- ADR 0094 / T0: modern frame, item, map and container APIs use the existing
-- UI harness. Forever 1.60.1 has no ToyBox or the six PetJournal readers used
-- by this addon. No synthetic replacements for those APIs or recipe readers.
GetBuildInfo = function() return "1.60.1", "70888", "", 16001 end
C_ToyBox = nil
C_PetJournal = nil
C_TradeSkillUI = {}
InCombatLockdown = function() return false end
issecretvalue = function() return false end
UnitLevel = function() return 23 end
C_QuestLog = { GetNumQuestLogEntries = function() return 0 end }

return function(ns)
  local sandbox = {}
  local fixture = assert(loadfile("../packages/contracts/fixtures/snapshot-forever.lua"))
  setfenv(fixture, sandbox)
  fixture()
  assert(sandbox.UnboredCharDB.data.sections.char.body.game == ns.Game)
  assert(ns.Game == "forever", "interface 16001 selects Forever")
  for _, name in ipairs({ "mplus", "vault", "pets", "toys", "transmog", "talents", "warband" }) do
    assert(not ns.Snapshot.defs[name], name .. " must not register on Forever")
  end
  for _, name in ipairs({ "char", "gear", "questLog", "professions", "reputation" }) do
    assert(ns.Snapshot.defs[name], name .. " remains shared")
  end
  assert(ns.Providers.quests and not ns.Providers.farm and not ns.Providers.fun)
  assert(#ns.Data.Presets == 0 and next(ns.Data.ItemNotes) == nil)
  ns.Snapshot.LoginPass()
  while ns.Snapshot.Step(true) do end
  assert(ns.Snapshot.Body("char").game == "forever")
  assert(ns.Snapshot.Body("char").level == 23)
  assert(#(ns.DB.errors or {}) == 0, "login and staged collection must not report Lua errors")
  local report = ns.SelfCheck.Run()
  assert(report.game == "forever")
  local row = ns.DB.errors[#ns.DB.errors]
  assert(row.text:find("game=forever", 1, true))
  assert(not row.stack:find("C_ToyBox.GetToyLink error", 1, true))
  assert(not row.stack:find("C_PetJournal.GetOwnedPetIDs error", 1, true))
  print("Forever: full TOC, init, login, char collection and SelfCheck passed")
end
