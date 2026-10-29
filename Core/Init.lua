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
  ns.DB = UnboredDB
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
end

function ns.OnAddonLoaded()
  initDB()
  if ns.UI and ns.UI.Create then
    ns.UI.Create()
  end
  if ns.CreateMinimapButton then
    ns.CreateMinimapButton()
  end
  if ns.RegisterCompartment then
    ns.RegisterCompartment()
  end
  if ns.Events and ns.Events.StartTicker then
    ns.Events.StartTicker()
  end
  if C_Calendar and C_Calendar.OpenCalendar then
    pcall(C_Calendar.OpenCalendar)
  end
  if type(RequestRaidInfo) == "function" then
    pcall(RequestRaidInfo)
  end
end

function ns.OnEnteringWorld()
  if ns.RegisterCompartment then
    ns.RegisterCompartment()
  end
  ns.Session:Start()
end

local function slash(message)
  message = ns.Trim(message or "")
  local command, rest = message:match("^(%S*)%s*(.*)$")
  command = (command or ""):lower()
  if command == "" then
    ns.UI:Toggle()
  elseif command == "import" then
    ns.ShowImport(rest)
  elseif command == "export" then
    ns.ShowExport()
  elseif command == "roam" or command == "quests" or command == "events" or command == "fun" or command == "farm" then
    ns.Session:SetMode(command)
    ns.UI:Show()
  elseif command == "30" or command == "60" or command == "120" then
    ns.Session:SetBudget(tonumber(command))
    ns.UI:Show()
  elseif command == "refresh" then
    ns.Session:Rebuild()
    ns.UI:Show()
  elseif command == "tomtom" then
    ns.DB.useTomTom = not ns.DB.useTomTom
    ns.Print(ns.DB.useTomTom and ns.T("TOMTOM_ON") or ns.T("TOMTOM_OFF"))
  elseif command == "minimap" then
    local hide = ns.DB.minimap and ns.DB.minimap.hide
    ns.MinimapSetShown(hide and true or false)
    ns.Print(hide and ns.T("MINIMAP_ON") or ns.T("MINIMAP_OFF"))
  elseif command == "companion" then
    ns.Session:ApplyCompanion(true)
    ns.UI:Show()
  elseif command == "where" then
    local mapID, x, y = ns.PlayerPosition()
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
  if ns.UI and ns.UI.Toggle then
    ns.UI:Toggle()
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
      ns.OnEnteringWorld()
      return
    end
    if ns.Events and ns.Events.OnEvent then
      ns.Events.OnEvent(event, arg1, ...)
    end
  end)
end
