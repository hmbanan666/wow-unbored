local ns = {}
local now, combat, locale, npc, id = 1000, false, 'enUS', true, 42
local secret = {}
function issecretvalue(v) return v == secret end
function InCombatLockdown() return combat end
function time() return now end
function GetLocale() return locale end
function UnitGUID() return npc and 'Creature-0-1-2-3-123-abcdef' or 'Player-1-123' end
function UnitName() assert(npc, 'never read player names'); return 'Quest giver' end
function GetQuestID() return id end
function GetTitleText() return 'A beginning' end
C_Map = { GetBestMapForUnit = function() return 37 end,
  GetPlayerMapPosition = function() return { x = 0.12345, y = 0.67891 } end }
C_QuestLog = { GetLogIndexForQuestID = function() return 1 end,
  GetInfo = function() return { questID = id, title = 'A beginning', level = 5 } end }
for _, file in ipairs({ 'Namespace', 'Locale', 'Util', 'Pack', 'Data/Store' }) do
  assert(loadfile('Core/' .. file .. '.lua'))('Unbored', ns)
end
ns.Game = 'forever'
UnboredDB, UnboredCharDB = {}, {}
ns.DB = UnboredDB
assert(loadfile('Core/Data/QuestSeen.lua'))('Unbored', ns)
local S = ns.Snapshot
local function settle() now = now + 3; S.Pulse(); S.Drain() end
S.OnEvent('QUEST_DETAIL', 999) -- payload is a start item, not the quest id.
S.OnEvent('QUEST_ACCEPTED', id); settle()
local row = S.Body('questSeen').entries[1]
assert(row.questID == 42 and row.title == 'A beginning' and row.level == 5)
assert(row.acceptedAt == 1000 and row.accept.x == 12.3 and row.accept.npcId == 123)
S.OnEvent('QUEST_REMOVED', id); settle()
S.OnEvent('QUEST_ACCEPTED', id); settle()
assert(S.Body('questSeen').entries[1].acceptedAt == 1000)
S.OnEvent('QUEST_TURNED_IN', id); settle()
row = S.Body('questSeen').entries[1]
assert(row.turnedInAt and row.turnIn.y == 67.9)
npc = false; id = 43; S.OnEvent('QUEST_ACCEPTED', id); settle()
assert(not S.Body('questSeen').entries[2].accept.npcName)
locale = 'ruRU'; id = 44; S.OnEvent('QUEST_ACCEPTED', id); settle()
assert(not S.Body('questSeen').entries[3].title)
combat = true; id = 45; S.OnEvent('QUEST_ACCEPTED', id); combat = false; settle()
assert(#S.Body('questSeen').entries == 3)
S.OnEvent('QUEST_ACCEPTED', secret); settle(); assert(#S.Body('questSeen').entries == 3)
locale = 'enUS'; npc = true
for n = 50, 550 do id = n; S.OnEvent('QUEST_ACCEPTED', n); settle() end
assert(#S.Body('questSeen').entries == 500 and S.Body('questSeen').entries[1].questID == 51)
assert(S.Measure(UnboredCharDB) < 400 * 1024)
ns.DB.shareData = false; S.ApplySharing(); S.OnEvent('QUEST_ACCEPTED', 999); settle()
assert(not S.Body('questSeen'))
ns.DB.shareData = true
id = 888; S.OnEvent('QUEST_ACCEPTED', id)
ns.DB.shareData = false; S.ApplySharing(); ns.DB.shareData = true; settle()
assert(not S.Body('questSeen'), 'turning sharing off discards pending observations')
local oldInfo, oldGUID = C_QuestLog.GetInfo, UnitGUID
C_QuestLog.GetInfo = function() return secret end
C_QuestLog.GetTitleForQuestID = function() return 'Completed before collection' end
C_QuestLog.GetQuestDifficultyLevel = function() return 7 end
UnitGUID = function() return secret end
id = 889; S.OnEvent('QUEST_FINISHED'); S.OnEvent('QUEST_TURNED_IN', id); settle()
row = S.Body('questSeen').entries[1]
assert(row.title == 'Completed before collection' and row.level == 7 and not row.turnIn.npcName)
C_QuestLog.GetInfo, UnitGUID = oldInfo, oldGUID
print('Quest sighting collection checks passed')

assert(loadfile('../packages/contracts/fixtures/quest-sightings.lua'))()
assert(UnboredCharDB.data.sections.questSeen.body.entries[1].turnIn.npcId == 124)
