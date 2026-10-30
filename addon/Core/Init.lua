local addonName, ns = ...

local function initDB()
  if type(UnboredDB) ~= "table" then
    UnboredDB = {}
  end
  if UnboredDB.version ~= 1 then
    local companion = UnboredDB.companionPlan
    UnboredDB = {
      version = 1,
      minimap = { hide = false, angle = 210 },
      window = { point = "TOPRIGHT", rel = "TOPRIGHT", x = -80, y = -220 },
      useTomTom = false,
      mode = "roam",
      budget = 60,
      companionPlan = companion,
    }
  end
  UnboredDB.minimap = UnboredDB.minimap or { hide = false, angle = 210 }
  UnboredDB.window = UnboredDB.window or { point = "TOPRIGHT", rel = "TOPRIGHT", x = -80, y = -220 }
  if UnboredDB.useTomTom == nil then
    UnboredDB.useTomTom = false
  end
  if not UnboredDB.mode then
    UnboredDB.mode = "roam"
  end
  if not UnboredDB.budget then
    UnboredDB.budget = 60
  end
  if UnboredDB.tomtomArrow == nil then
    UnboredDB.tomtomArrow = true
  end
  if UnboredDB.chatNotes == nil then
    UnboredDB.chatNotes = false
  end
  if type(UnboredDB.tracker) ~= "table" then
    UnboredDB.tracker = {}
  end
  if type(UnboredDB.mascot) ~= "table" then
    UnboredDB.mascot = {}
  end
  if UnboredDB.shareData == nil then
    UnboredDB.shareData = true
  end
  if UnboredDB.tooltipLines == nil then
    UnboredDB.tooltipLines = true
  end
  if type(UnboredDB.itemNotes) ~= "table" then
    UnboredDB.itemNotes = {}
  end
  ns.DB = UnboredDB
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
end

local function askForWorldData()
  -- Both of these are empty until the server answers. The matching
  -- events (CALENDAR_UPDATE_EVENT_LIST, UPDATE_INSTANCE_INFO) rebuild
  -- a list the player has not touched yet.
  if C_Calendar and C_Calendar.OpenCalendar then
    pcall(C_Calendar.OpenCalendar)
  end
  if type(RequestRaidInfo) == "function" then
    pcall(RequestRaidInfo)
  end
end

function ns.OnAddonLoaded()
  initDB()
  if ns.UI and ns.UI.Create then
    local ok, err = pcall(ns.UI.Create)
    if not ok then
      ns.ReportError(err)
    end
  end
  if ns.Tracker and ns.Tracker.Create then
    local ok, err = pcall(ns.Tracker.Create, ns.Tracker)
    if not ok then
      ns.ReportError(err)
    end
  end
  if ns.Mascot and ns.Mascot.Create then
    local ok, err = pcall(ns.Mascot.Create, ns.Mascot)
    if not ok then
      ns.ReportError(err)
    end
  end
  if ns.Items and ns.Items.Hook then
    pcall(ns.Items.Hook)
  end
  if ns.CreateMinimapButton then
    pcall(ns.CreateMinimapButton)
  end
  if ns.RegisterCompartment then
    pcall(ns.RegisterCompartment)
  end
  if ns.Events and ns.Events.StartTicker then
    pcall(ns.Events.StartTicker)
  end
  askForWorldData()
end

function ns.OnEnteringWorld(initialLogin)
  if ns.Profile then
    pcall(ns.Profile.StartSession, initialLogin == true)
  end
  if ns.RegisterCompartment then
    pcall(ns.RegisterCompartment)
  end
  askForWorldData()
  if ns.Snapshot then
    pcall(ns.Snapshot.OnEnteringWorld)
  end
  if ns.Session and ns.Session.Start then
    local ok, err = pcall(function()
      ns.Session:Start(initialLogin == true)
    end)
    if not ok then
      ns.ReportError(err)
    end
  end
end

local function slash(message)
  message = ns.Trim(message or "")
  local command, rest = message:match("^(%S*)%s*(.*)$")
  command = (command or ""):lower()
  if command == "" then
    ns.Mascot:ShowChoice()
  elseif command == "show" then
    ns.Mascot:Reveal()
  elseif command == "hide" then
    ns.Mascot:Hide()
  elseif command == "ask" or command == "nearby" or command == "item" then
    ns.Mascot:ShowAsk(command, rest ~= "" and rest or nil)
  elseif command == "errors" then
    local list = type(ns.DB.errors) == "table" and ns.DB.errors or {}
    if #list == 0 then
      ns.Print(ns.T("ERRORS_NONE"))
    end
    for i = 1, #list do
      ns.Print(tostring(list[i].version) .. ": " .. tostring(list[i].text))
    end
  elseif command == "tracker" or command == "list" then
    ns.Tracker:Toggle()
  elseif command == "lock" then
    local locked = not ns.Mascot:Locked()
    ns.Mascot:SetLocked(locked)
    ns.Tracker:SetLocked(locked)
    ns.Print(locked and ns.T("LOCKED") or ns.T("UNLOCKED"))
  elseif command == "reset" then
    ns.Mascot:ResetPosition()
    ns.Tracker:ResetPosition()
  elseif command == "build" then
    ns.Session:BuildHere()
  elseif command == "import" then
    ns.ShowImport(rest)
  elseif command == "export" then
    ns.ShowExport()
  elseif command == "roam" or command == "quests" or command == "events" or command == "fun" or command == "farm" then
    ns.Session:SetMode(command)
    ns.Mascot:ShowWish()
  elseif command == "30" or command == "60" or command == "120" then
    ns.Session:SetBudget(tonumber(command))
    ns.Mascot:ShowChoice()
  elseif command == "tomtom" then
    ns.DB.tomtomArrow = not ns.DB.tomtomArrow
    ns.Print(ns.DB.tomtomArrow and ns.T("TOMTOM_ON") or ns.T("TOMTOM_OFF"))
    ns.Session:Waypoint()
  elseif command == "chat" then
    ns.DB.chatNotes = not ns.DB.chatNotes
    ns.Print(ns.DB.chatNotes and ns.T("CHAT_ON") or ns.T("CHAT_OFF"))
  elseif command == "minimap" then
    local hide = ns.DB.minimap and ns.DB.minimap.hide
    ns.MinimapSetShown(hide and true or false)
    ns.Print(hide and ns.T("MINIMAP_ON") or ns.T("MINIMAP_OFF"))
  elseif command == "companion" then
    if not ns.Session:UseExternal() then
      ns.Print(ns.T("COMPANION_NONE"))
    end
  elseif command == "where" then
    local mapID, x, y = ns.RawPlayerPosition()
    if not mapID or not x or not y then
      ns.Print(ns.T("WHERE_NONE"))
    else
      ns.Print(ns.T("WHERE", ns.MapName(mapID) or "", mapID, x * 100, y * 100))
    end
  else
    ns.Print(ns.T("SLASH_HELP"))
  end
end

function Unbored_Toggle()
  if ns.Mascot and ns.Mascot.ShowChoice then
    ns.Mascot:ShowChoice()
  end
end

function Unbored_Done()
  if ns.Session then
    ns.Session:Done()
  end
end

function Unbored_Skip()
  if ns.Session then
    ns.Session:Skip()
  end
end

function Unbored_Waypoint()
  if ns.Session then
    ns.Session:Waypoint()
  end
end

-- The Refresh key: the same as pressing Refresh or Load on Wisp.
function Unbored_LoadPlan()
  if ns.Mascot and ns.Mascot.OnLoad then
    ns.Mascot.OnLoad()
  else
    ns.Session.RefreshNow()
  end
end

if SlashCmdList then
  SLASH_UNBORED1 = "/unbored"
  SLASH_UNBORED2 = "/ub"
  SlashCmdList["UNBORED"] = slash
end

if CreateFrame then
  local driver = CreateFrame("Frame")
  driver:RegisterEvent("ADDON_LOADED")
  driver:RegisterEvent("PLAYER_ENTERING_WORLD")
  driver:RegisterEvent("ZONE_CHANGED_NEW_AREA")
  if ns.Events and ns.Events.Register then
    ns.Events.Register(driver)
  end
  driver:SetScript("OnEvent", function(_, event, arg1, ...)
    if event == "ADDON_LOADED" then
      if arg1 == addonName or arg1 == ns.addon then
        ns.OnAddonLoaded()
      end
      return
    end
    if event == "PLAYER_ENTERING_WORLD" then
      ns.OnEnteringWorld(arg1)
      return
    end
    if ns.Events and ns.Events.OnEvent then
      ns.Events.OnEvent(event, arg1, ...)
    end
  end)
end
