-- Collection boundaries against the public game APIs; both games use this path.
local ns = {}
local now, combat, npc = 1000, false, 123
local secret = {}
function issecretvalue(v) return v == secret end
function InCombatLockdown() return combat end
function time() return now end
function UnitGUID() return npc and ('Creature-0-1-2-3-' .. npc .. '-abcdef') or 'Player-1-123' end
function UnitName() assert(npc, 'never read a player name'); return 'Recipe teacher' end
function GetLocale() return 'enUS' end
C_Map = { GetBestMapForUnit = function() return 37 end,
  GetPlayerMapPosition = function() return { x = 0.12345, y = 0.67891 } end }
C_Trainer = { GetTrainerType = function() return 2 end }
Enum = { TrainerType = { Tradeskills = 2 }, TooltipDataType = { Spell = 1 } }
function GetNumTrainerServices() return 3 end
function GetTrainerServiceStepIndex() return 3 end
function GetTrainerServiceInfo(i) return i == 1 and 'Minor Healing Potion' or 'Other', 'available' end
function GetTrainerServiceSkillReq() return 'Alchemy', 25, true end
function GetTrainerServiceCost() return 100 end
C_TooltipInfo = { GetTrainerService = function(i) return i == 1 and { type = 1, id = 2330 } or nil end }
function GetMerchantNumItems() return 2 end
function GetMerchantItemID(i) return i == 1 and 2553 or 6948 end
C_MerchantFrame = { GetItemInfo = function()
  return { price = 400, stackCount = 1, numAvailable = -1, hasExtendedCost = false }
end }
C_Item = { GetItemInfoInstant = function(id) return id, nil, nil, nil, nil, id == 2553 and 9 or 15 end }
for _, file in ipairs({ 'Namespace', 'Locale', 'Util', 'Pack', 'Data/Store' }) do
  assert(loadfile('Core/' .. file .. '.lua'))('Unbored', ns)
end
ns.Profile = { Professions = function() return { { name = 'Alchemy', skillLine = 171 } } end }
assert(loadfile('Core/Data/RecipeSources.lua'))('Unbored', ns)
local S = ns.Snapshot
for _, game in ipairs({ 'forever', 'retail' }) do
  ns.Game = game
  UnboredDB, UnboredCharDB = {}, {}
  ns.DB = UnboredDB
  S.OnEvent('TRAINER_SHOW'); assert(S.Read('trainerSeen', 'window'))
  local rows = S.Body('trainerSeen').entries
  assert(#rows == 2 and rows[1].spellId == 2330 and rows[2].name == 'Other')
  assert(rows[1].skillLine == 171 and rows[1].requiredSkill == 25)
  assert(rows[1].x == 12.3 and rows[1].y == 67.9)
  now = now + 1; assert(S.Read('trainerSeen', 'window'))
  assert(#S.Body('trainerSeen').entries == 2)
  S.OnEvent('MERCHANT_SHOW'); assert(S.Read('merchantSeen', 'window'))
  assert(#S.Body('merchantSeen').entries == 1 and S.Body('merchantSeen').entries[1].itemId == 2553)
  local before = S.Get('merchantSeen')
  npc = nil; assert(not S.Read('merchantSeen', 'window')); assert(S.Get('merchantSeen') == before)
  npc = 123; combat = true; assert(not S.Read('trainerSeen', 'window')); combat = false
  for i = 1, 210 do
    npc = i; now = now + 1
    S.Read('merchantSeen', 'window'); S.Read('trainerSeen', 'window')
  end
  assert(#S.Body('trainerSeen').entries == 200)
  assert(S.Measure(UnboredCharDB) < 400 * 1024)
  assert(#S.Body('merchantSeen').entries == 200)
  assert(S.Body('merchantSeen').entries[1].npcId == 11)
  local oldGUID = UnitGUID
  UnitGUID = function() return secret end
  assert(not S.Read('merchantSeen', 'window'))
  UnitGUID = oldGUID
  local oldInfo = C_MerchantFrame.GetItemInfo
  C_MerchantFrame.GetItemInfo = function() return { price = secret, numAvailable = -1 } end
  assert(not S.Read('merchantSeen', 'window'))
  C_MerchantFrame.GetItemInfo = function() error('API unavailable') end
  assert(not S.Read('merchantSeen', 'window'))
  C_MerchantFrame.GetItemInfo = oldInfo
  local oldTrainer = C_Trainer.GetTrainerType
  C_Trainer.GetTrainerType = function() return 0 end
  assert(not S.Read('trainerSeen', 'window'))
  C_Trainer.GetTrainerType = oldTrainer
  local oldStep = GetTrainerServiceStepIndex
  GetTrainerServiceStepIndex = function() return nil end
  assert(S.Read('trainerSeen', 'window'), 'trainers without rank training still offer recipes')
  GetTrainerServiceStepIndex = oldStep
  S.OnEvent('MERCHANT_CLOSED'); assert(not S.Read('merchantSeen', 'window'))
  ns.DB.shareData = false; S.ApplySharing()
  assert(not S.Body('trainerSeen') and not S.Body('merchantSeen'))
  assert(not S.Read('trainerSeen', 'window'))
end
print('Recipe source collection checks passed')

-- Advice uses observed learned sets; missing data never means missing recipes.
ns.Game = 'forever'
ns.DB = { alts = {} }
UnboredCharDB = {}
function UnitName(unit) assert(unit == 'player'); return 'Hero' end
function GetRealmName() return 'Realm' end
ns.Profile.AltKey = function(name, realm) return realm .. '-' .. name end
ns.Profile.currentAltKey = 'Realm-Hero'
UnboredRecipeTeaching = { game = 'forever', items = { [2553] = { 2330, 171, 50 } } }
assert(loadfile('Core/RecipeAdvice.lua'))('Unbored', ns)
assert(ns.RecipeAdvice.For(2553, 'en') == nil)
S.Register({ name = 'professions' }); S.Register({ name = 'recipes' })
S.Write('professions', { list = { { skillLine = 171, name = 'Alchemy', skill = 25 } } })
S.Write('recipes', { byProfession = { ['171'] = { learned = { 'ids1' } } } })
assert(ns.RecipeAdvice.For(2553, 'en') == nil, 'filtered absence is not proof of unlearned')
S.Write('recipes', { byProfession = { ['171'] = { learned = { 'ids1' }, unlearned = ns.Pack.Encode({ 2330 }) } } })
assert(ns.RecipeAdvice.For(2553, 'en') == 'new recipe for you, Alchemy 50')
S.Write('recipes', { byProfession = { ['171'] = { learned = ns.Pack.Encode({ 2330 }) } } })
assert(ns.RecipeAdvice.For(2553, 'en') == nil)
ns.DB.alts['Realm-Mira'] = { game = 'forever', name = 'Mira',
  professions = { { skillLine = 171, name = 'Alchemy', skill = 50 } },
  recipeKnowledge = { ['171'] = { learned = { 'ids1' }, unlearned = ns.Pack.Encode({ 2330 }) } } }
ns.RecipeAdvice.Invalidate()
assert(ns.RecipeAdvice.For(2553, 'en') == 'Mira can learn this')
assert(ns.RecipeAdvice.For(2553, 'en', true) == nil)
ns.DB.alts['Realm-Mira'].professions[1].skill = 49; ns.RecipeAdvice.Invalidate()
assert(ns.RecipeAdvice.For(2553, 'en') == nil)
ns.DB.alts['Realm-Mira'].professions[1].skill = 50
local before = ns.Pack.Set
ns.RecipeAdvice.Invalidate(); ns.RecipeAdvice.For(2553, 'en')
ns.Pack.Set = function() error('must not scan on a second tooltip') end
assert(ns.RecipeAdvice.For(2553, 'en') == 'Mira can learn this')
ns.Pack.Set = before
ns.DB.alts['Realm-Mira'].game = 'retail'; ns.RecipeAdvice.Invalidate()
assert(ns.RecipeAdvice.For(2553, 'en') == nil)
UnboredRecipeTeaching.game = 'retail'; ns.RecipeAdvice.Invalidate()
assert(ns.RecipeAdvice.For(2553, 'en') == nil)
print('Recipe Advice checks passed')

-- The addon and Companion read the same data-shaped fixture.
assert(loadfile('../packages/contracts/fixtures/recipe-sightings.lua'))()
assert(UnboredCharDB.data.sections.trainerSeen.body.entries[1].spellId == 2335)
assert(UnboredCharDB.data.sections.merchantSeen.body.entries[2].numAvailable == 0)
assert(loadfile('../packages/contracts/fixtures/recipe-teaching.lua'))()
assert(UnboredRecipeTeaching.items[2555][1] == 2335)
assert(ns.Pack.Set(UnboredCharDB.data.sections.recipes.body.byProfession['171'].unlearned)[2335])

-- Trade Goods share the bounded merchant Section; stack prices become unit prices.
ns.DB.shareData = true; npc = 123
function UnitName() return 'Reagent vendor' end
function GetMerchantNumItems() return 2 end
function GetMerchantItemID(i) return i == 1 and 2320 or 6948 end
C_Item.GetItemInfoInstant = function(id) return id, nil, nil, nil, nil, id == 2320 and 7 or 15 end
C_MerchantFrame.GetItemInfo = function()
  return { price = 50, stackCount = 5, numAvailable = -1, hasExtendedCost = false }
end
S.OnEvent('MERCHANT_SHOW'); assert(S.Read('merchantSeen', 'window'))
local reagent = S.Body('merchantSeen').entries[#S.Body('merchantSeen').entries]
assert(reagent.itemId == 2320 and reagent.cost == 10)
C_MerchantFrame.GetItemInfo = function()
  return { price = 0, stackCount = 1, numAvailable = -1, hasExtendedCost = true }
end
now = now + 1; assert(S.Read('merchantSeen', 'window'))
assert(S.Body('merchantSeen').entries[#S.Body('merchantSeen').entries].cost == nil, 'barter is not free copper')
print('Reagent sightings passed')

C_MerchantFrame.GetItemInfo = function()
  return { price = 50, stackCount = 5, numAvailable = -1, hasExtendedCost = false }
end
for i = 1, 210 do npc = i; now = now + 1; S.Read('merchantSeen', 'window') end
assert(#S.Body('merchantSeen').entries == 200)
assert(S.Body('merchantSeen').entries[1].npcId == 11)
assert(S.Measure(UnboredCharDB) < 400 * 1024)

C_MerchantFrame.GetItemInfo = function()
  return { price = 50, stackCount = 5, numAvailable = -1, hasExtendedCost = secret }
end
assert(not S.Read('merchantSeen', 'window'), 'secret extended cost never supplies a copper price')
