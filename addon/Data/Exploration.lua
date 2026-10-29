local _, ns = ...

-- Continent exploration achievements. Incomplete criteria become "go look
-- at this zone" tasks. IDs from the public achievement tables
-- (Explore Eastern Kingdoms is 42, Kalimdor 43, Outland 44, Northrend 45,
-- Cataclysm 4868, Pandaria 6974). Add later continents the same way.
-- https://warcraft.wiki.gg/wiki/API_GetAchievementInfo

ns.Data.Exploration = {
  { achievementID = 42, fallbackTitle = "Explore Eastern Kingdoms", estMinutes = 12 },
  { achievementID = 43, fallbackTitle = "Explore Kalimdor", estMinutes = 12 },
  { achievementID = 44, fallbackTitle = "Explore Outland", estMinutes = 12 },
  { achievementID = 45, fallbackTitle = "Explore Northrend", estMinutes = 12 },
  { achievementID = 4868, fallbackTitle = "Explore Cataclysm", estMinutes = 12 },
  { achievementID = 6974, fallbackTitle = "Explore Pandaria", estMinutes = 12 },
}
