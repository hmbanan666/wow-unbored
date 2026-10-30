# 0038. One card for the Plan

Status: accepted

The separate All steps window (the old Tracker) is gone; the step Bubble is one quest-log style card, 300 px wide: Plan title, progress pips, Goal, the Step with its why, a Details toggle, a Next preview with the full list inline, Rewards, a muted footer time ("about 25 min", no `~`), and only [Done] [Skip] (D90-D92). Plans gain optional `title`, `goal`, `details`, `rewards` and Steps optional `why`, `rewards`, `condition` checked live in the addon; a missing title falls back to the Preset label, never to `note` (D93-D97). This supersedes the Tracker parts of [0016](0016-bubble-layout.md) and amends [0004](0004-wisp-first-ui.md).
