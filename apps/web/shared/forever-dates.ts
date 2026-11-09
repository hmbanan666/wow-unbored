/** Reopen these official announcements when Blizzard changes the schedule. */
export const FOREVER_DATES = {
  checked: "2026-11-09",
  checkedLabel: "9 November 2026",
  entries: [
    {
      title: "Launch",
      text: "4 November 2026, 3:00 p.m. PST (23:00 UTC). WoW Forever is live.",
      source: "Blizzard launch announcement",
      url: "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
    },
    {
      title: "Raids",
      text: "9 December 2026. Blizzard's launch article gives this opening date for level 60 players.",
      source: "Blizzard raid opening date",
      url: "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
    },
    {
      title: "Hardcore ruleset",
      text: "Sometime after launch. Blizzard has not given a date in its launch article.",
      source: "Blizzard ruleset announcement",
      url: "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
    },
  ],
} as const;
