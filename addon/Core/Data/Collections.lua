-- Account-wide collections: achievements, mounts, pets, toys, transmog.

local _, ns = ...

local S = ns.Snapshot
local num, boolean, str, call = ns.AsNumber, ns.AsBoolean, ns.SafeString, ns.Call

local DAY = 24 * 60 * 60

local function copy(body)
  local out = {}
  for key, value in pairs(type(body) == "table" and body or {}) do
    out[key] = value
  end
  return out
end

-- The full achievement scan is ~10k calls: staged, and at most once a day per
-- Account (D51); ACHIEVEMENT_EARNED adds new ones in between.
S.Register({
  name = "achievements",
  scope = "account",
  v = 1,
  prio = 60,
  every = DAY,
  events = { "ACHIEVEMENT_EARNED" },
  read = function(previous, src)
    -- Event payloads add ids immediately; the one API read waits for the
    -- settled worker outside combat. A queued event must still perform a due
    -- daily scan: queue deduplication may have combined it with the login job.
    local scannedAt = type(previous) == "table" and num(previous.scannedAt)
    if src == "event" and scannedAt and ns.Now() - scannedAt < DAY then
      local out = copy(previous)
      out.points = num(call(GetTotalAchievementPoints)) or previous.points
      return out
    end
    if type(GetCategoryList) ~= "function" or type(GetCategoryNumAchievements) ~= "function"
      or type(GetAchievementInfo) ~= "function" then
      return nil
    end
    local categories = call(GetCategoryList)
    if type(categories) ~= "table" or #categories == 0 then
      return nil
    end
    local done, mine, calls = {}, {}, 0
    for i = 1, #categories do
      local total = num(call(GetCategoryNumAchievements, categories[i], true)) or 0
      for j = 1, total do
        local id, _, _, completed, _, _, _, _, _, _, _, isGuild, earnedByMe = call(GetAchievementInfo, categories[i], j)
        id = num(id)
        if id and completed == true and not isGuild then
          done[#done + 1] = id
          if earnedByMe == true then
            mine[#mine + 1] = id
          end
        end
        calls = calls + 1
        if calls % 100 == 0 then
          S.Yield()
        end
      end
    end
    if #done == 0 then
      return nil
    end
    S.Write("achievementsMine", { ids = ns.Pack.Encode(mine), count = #mine }, "daily")
    return {
      ids = ns.Pack.Encode(done),
      count = #done,
      points = num(call(GetTotalAchievementPoints)),
      scannedAt = ns.Now(),
    }
  end,
  delta = function(body, _, achievementID)
    achievementID = num(achievementID)
    if achievementID then
      S.Mark("achievements", "event")
    end
    if not achievementID or type(body) ~= "table" then
      return nil
    end
    local out = copy(body)
    out.ids = ns.Pack.Add(body.ids, achievementID)
    out.count = ns.Pack.Count(out.ids)
    return out
  end,
})

-- Progress toward achievements nobody on the Account has finished (D182):
-- a staged walk once a day per Character, a minute after the login pass.
-- Rows at least half done, best first; the Server's Ready now lists >= 0.7.
-- TODO(verify-in-game): one pass stays under ~60 s of staged frames on a big
-- Account.
S.ACH_MIN_RATIO = 0.5
S.ACH_MAX_ROWS = 200
S.ACH_MAX_CRITERIA = 60
S.ACH_MAX_CALLS = 60000
S.ACH_OPEN = 5

-- d of t done and up to five criteria still open, or nil to skip it.
local function achievementProgress(id, counter)
  local count = num(call(GetAchievementNumCriteria, id))
  counter.calls = counter.calls + 1
  if not count or count < 1 or count > S.ACH_MAX_CRITERIA then
    return nil
  end
  if count == 1 then
    local _, _, done, quantity, required, _, _, _, _, criteriaID = call(GetAchievementCriteriaInfo, id, 1)
    counter.calls = counter.calls + 1
    done = boolean(done)
    quantity, required = num(quantity), num(required)
    if done ~= false or not quantity or not required or required <= 1 then
      return nil
    end
    return math.min(quantity, required), required, { num(criteriaID) }
  end
  local d, open = 0, {}
  for k = 1, count do
    local _, _, done, _, _, _, _, _, _, criteriaID = call(GetAchievementCriteriaInfo, id, k)
    counter.calls = counter.calls + 1
    done = boolean(done)
    if done == nil then
      return nil
    end
    if done == true then
      d = d + 1
    elseif #open < S.ACH_OPEN then
      open[#open + 1] = num(criteriaID)
    end
  end
  return d, count, open
end

S.Register({
  name = "achProgress",
  v = 1,
  prio = 20,
  every = DAY,
  delay = 60,
  read = function()
    if type(GetCategoryList) ~= "function" or type(GetCategoryNumAchievements) ~= "function"
      or type(GetAchievementInfo) ~= "function" or type(GetAchievementNumCriteria) ~= "function"
      or type(GetAchievementCriteriaInfo) ~= "function" then
      return nil
    end
    local categories = call(GetCategoryList)
    if type(categories) ~= "table" or #categories == 0 then
      return nil
    end
    local rows, counter, nextYield = {}, { calls = 0 }, 100
    for i = 1, #categories do
      local total = num(call(GetCategoryNumAchievements, categories[i], true)) or 0
      for j = 1, total do
        if counter.calls >= S.ACH_MAX_CALLS then
          break
        end
        local id, name, _, completed, _, _, _, _, _, _, _, isGuild = call(GetAchievementInfo, categories[i], j)
        id = num(id)
        completed, isGuild = boolean(completed), boolean(isGuild)
        counter.calls = counter.calls + 1
        if id and completed == false and isGuild == false then
          local d, t, open = achievementProgress(id, counter)
          if d and t and t > 0 and d < t and d / t >= S.ACH_MIN_RATIO then
            -- The name (client language) lets Ready now say what it is (0.11).
            rows[#rows + 1] = {
              id = id,
              name = str(name, 60),
              d = d,
              t = t,
              open = open and #open > 0 and open or nil,
            }
          end
        end
        if counter.calls >= nextYield then
          nextYield = counter.calls + 100
          S.Yield()
        end
      end
    end
    table.sort(rows, function(a, b)
      local ra, rb = a.d / a.t, b.d / b.t
      if ra == rb then
        return a.id < b.id
      end
      return ra > rb
    end)
    for k = #rows, S.ACH_MAX_ROWS + 1, -1 do
      rows[k] = nil
    end
    return {
      rows = rows,
      count = #rows,
      capped = counter.calls >= S.ACH_MAX_CALLS or nil,
      scannedAt = ns.Now(),
    }
  end,
})

-- Achievements this character earned itself; written by the daily scan.
S.Register({
  name = "achievementsMine",
  v = 1,
  prio = 25,
  login = false,
  events = { "ACHIEVEMENT_EARNED" },
  read = function()
    return nil
  end,
  delta = function(body, _, achievementID, alreadyEarned)
    achievementID = num(achievementID)
    if not achievementID or alreadyEarned == true or type(body) ~= "table" then
      return nil
    end
    local out = copy(body)
    out.ids = ns.Pack.Add(body.ids, achievementID)
    out.count = ns.Pack.Count(out.ids)
    return out
  end,
})

S.Register({
  name = "mounts",
  scope = "account",
  v = 1,
  prio = 65,
  events = { "NEW_MOUNT_ADDED" },
  read = function()
    local api = C_MountJournal
    if not api or not api.GetMountIDs or not api.GetMountInfoByID then
      return nil
    end
    local ids = call(api.GetMountIDs)
    if type(ids) ~= "table" or #ids == 0 then
      return nil
    end
    local owned = {}
    for i = 1, #ids do
      local collected = select(11, call(api.GetMountInfoByID, ids[i]))
      if collected == true then
        owned[#owned + 1] = num(ids[i])
      end
      if i % 200 == 0 then
        S.Yield()
      end
    end
    return { ids = ns.Pack.Encode(owned), count = #owned, total = #ids }
  end,
})

-- Pets: the owned-pet list does not depend on the journal filters when the
-- client has GetOwnedPetIDs; otherwise the journal is walked with the
-- collected filter forced on and restored, and a count that disagrees with
-- the journal total is treated as doubt and skipped.
-- TODO(verify-in-game): GetOwnedPetIDs exists on 12.x; the filter fallback
-- leaves the player's Pet Journal filters as they were.
local function petEntries()
  local api = C_PetJournal
  if api.GetOwnedPetIDs and api.GetPetInfoByPetID then
    local ids = call(api.GetOwnedPetIDs)
    if type(ids) == "table" then
      local out = {}
      for i = 1, #ids do
        out[#out + 1] = ids[i]
      end
      return out, true
    end
  end
  return nil, false
end

local function petFromID(petID)
  local api = C_PetJournal
  local speciesID, _, level = call(api.GetPetInfoByPetID, petID)
  speciesID = num(speciesID)
  if not speciesID then
    return nil
  end
  local quality
  if api.GetPetStats then
    quality = num(select(5, call(api.GetPetStats, petID)))
  end
  return { speciesID = speciesID, level = num(level), quality = quality }
end

local function walkJournal()
  local api = C_PetJournal
  if not api.GetNumPets or not api.GetPetInfoByIndex or not api.SetFilterChecked or not api.IsFilterChecked then
    return nil
  end
  local journal = rawget(_G, "PetJournal")
  if type(journal) == "table" and journal.IsShown and journal:IsShown() then
    return nil
  end
  local collectedFlag = rawget(_G, "LE_PET_JOURNAL_FILTER_COLLECTED") or 1
  local notCollectedFlag = rawget(_G, "LE_PET_JOURNAL_FILTER_NOT_COLLECTED") or 2
  local hadCollected = ns.Flag(call(api.IsFilterChecked, collectedFlag))
  local hadNot = ns.Flag(call(api.IsFilterChecked, notCollectedFlag))
  pcall(api.SetFilterChecked, collectedFlag, true)
  pcall(api.SetFilterChecked, notCollectedFlag, false)
  local shown, owned = call(api.GetNumPets)
  local out = {}
  for i = 1, num(shown) or 0 do
    local petID, speciesID, isOwned, _, level = call(api.GetPetInfoByIndex, i)
    if isOwned == true and num(speciesID) then
      local entry = petID and petFromID(petID) or { speciesID = num(speciesID), level = num(level) }
      out[#out + 1] = entry
    end
  end
  pcall(api.SetFilterChecked, collectedFlag, hadCollected)
  pcall(api.SetFilterChecked, notCollectedFlag, hadNot)
  if num(owned) and #out ~= owned then
    return nil
  end
  return out
end

S.Register({
  name = "pets",
  scope = "account",
  v = 1,
  prio = 50,
  events = { "NEW_PET_ADDED", "PET_JOURNAL_PET_DELETED" },
  read = function()
    if not C_PetJournal then
      return nil
    end
    local ids, direct = petEntries()
    local list
    if direct then
      list = {}
      for i = 1, #ids do
        local entry = petFromID(ids[i])
        if entry then
          list[#list + 1] = entry
        end
        if i % 100 == 0 then
          S.Yield()
        end
      end
    else
      list = walkJournal()
    end
    if not list or #list == 0 then
      return nil
    end
    -- Per species: how many, the best level and the best quality.
    local species = {}
    for i = 1, #list do
      local pet = list[i]
      local row = species[pet.speciesID] or { 0, 0, 0 }
      row[1] = row[1] + 1
      row[2] = math.max(row[2], pet.level or 0)
      row[3] = math.max(row[3], pet.quality or 0)
      species[pet.speciesID] = row
    end
    return { species = ns.Pack.EncodeValues(species), count = #list }
  end,
})

-- Toys: the Toy Box list is filtered, so the filters are forced open for the
-- read and restored; skipped while the Toy Box is shown. The search text is
-- never touched; a mismatch with the learned count is treated as doubt.
-- TODO(verify-in-game): the Toy Box filters are restored exactly.
S.Register({
  name = "toys",
  scope = "account",
  v = 1,
  prio = 55,
  events = { "NEW_TOY_ADDED", "TOYS_UPDATED" },
  read = function()
    local api = C_ToyBox
    if not api or not api.GetNumFilteredToys or not api.GetToyFromIndex or type(PlayerHasToy) ~= "function" then
      return nil
    end
    local box = rawget(_G, "ToyBox")
    if type(box) == "table" and box.IsShown and box:IsShown() then
      return nil
    end
    local saved = {}
    local setters = {
      { get = api.GetCollectedShown, set = api.SetCollectedShown, want = true },
      { get = api.GetUncollectedShown, set = api.SetUncollectedShown, want = false },
      { get = api.GetUnusableShown, set = api.SetUnusableShown, want = true },
    }
    for i = 1, #setters do
      local s = setters[i]
      if s.get and s.set then
        saved[i] = ns.Flag(call(s.get))
        pcall(s.set, s.want)
      end
    end
    local sources = {}
    if api.IsSourceTypeFilterChecked and api.SetSourceTypeFilter and type(C_PetJournal) == "table"
      and C_PetJournal.GetNumPetSources then
      for i = 1, num(call(C_PetJournal.GetNumPetSources)) or 0 do
        sources[i] = ns.Flag(call(api.IsSourceTypeFilterChecked, i))
        pcall(api.SetSourceTypeFilter, i, true)
      end
    end
    if api.ForceToyRefilter then
      pcall(api.ForceToyRefilter)
    end
    local owned = {}
    for i = 1, num(call(api.GetNumFilteredToys)) or 0 do
      local itemID = num(call(api.GetToyFromIndex, i))
      if itemID and itemID > 0 and call(PlayerHasToy, itemID) == true then
        owned[#owned + 1] = itemID
      end
    end
    for i = 1, #setters do
      if saved[i] ~= nil then
        pcall(setters[i].set, saved[i])
      end
    end
    for i, checked in pairs(sources) do
      pcall(api.SetSourceTypeFilter, i, checked)
    end
    if api.ForceToyRefilter then
      pcall(api.ForceToyRefilter)
    end
    local learned = api.GetNumLearnedDisplayedToys and num(call(api.GetNumLearnedDisplayedToys))
    if #owned == 0 or (learned and learned > #owned) then
      return nil
    end
    return { ids = ns.Pack.Encode(owned), count = #owned }
  end,
})

S.Register({
  name = "transmog",
  scope = "account",
  v = 1,
  prio = 45,
  events = { "TRANSMOG_COLLECTION_UPDATED" },
  read = function()
    local api = C_TransmogCollection
    local kinds = Enum and Enum.TransmogCollectionType
    if not api or not api.GetCategoryCollectedCount or not api.GetCategoryTotal or type(kinds) ~= "table" then
      return nil
    end
    local categories, collected, total = {}, 0, 0
    for name, id in pairs(kinds) do
      if type(id) == "number" and type(name) == "string" and name ~= "None" and name ~= "Count" then
        local have = num(call(api.GetCategoryCollectedCount, id))
        local all = num(call(api.GetCategoryTotal, id))
        if have and all and all > 0 then
          categories[#categories + 1] = { category = id, name = name, collected = have, total = all }
          collected, total = collected + have, total + all
        end
      end
    end
    if #categories == 0 then
      return nil
    end
    table.sort(categories, function(a, b)
      return a.category < b.category
    end)
    return { categories = categories, collected = collected, total = total }
  end,
})
