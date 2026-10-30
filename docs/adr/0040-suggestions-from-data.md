# 0040. Suggestions from data

Status: accepted

The Server computes up to 6 Suggestions per Character deterministically (no LLM) from the Game data snapshot and the Catalog exported from `addon/Data/*.lua`, on each snapshot upload, and the Companion writes them to `Unbored_Plan/Suggestions.lua` within the Prefetch budget (D103-D107). The choice Bubble shows up to 4 Suggestion chips before [Surprise me] [Something else] and a "More ideas" toggle for the Presets; a chip sends a Request with `topic = "suggestion"` and no time, and the addon adds up to 2 live Suggestions of its own (D108-D112).
