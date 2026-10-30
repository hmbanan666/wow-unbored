# 0038. One card for the Plan

Status: accepted

The separate All steps window (the old Tracker) is gone; the step Bubble is one quest-log style card, 300 px wide, with only [Done] [Skip] (D90-D92). Closed by default, for casual players, it shows just the Plan title, the Step (what to do and a short why, plus the Condition line if it has one), the main Reward and the buttons; one "Show more" toggle on the card opens the progress pips, Goal, Details, the full step list, every Reward and the muted footer time ("about 25 min", no `~`) in place, and the choice is remembered for the Account (owner, 0.8). Plans gain optional `title`, `goal`, `details`, `rewards` and Steps optional `why`, `rewards`, `condition` checked live in the addon; a missing title falls back to the Preset label, never to `note` (D93-D97). This supersedes the Tracker parts of [0016](0016-bubble-layout.md) and amends [0004](0004-wisp-first-ui.md).
