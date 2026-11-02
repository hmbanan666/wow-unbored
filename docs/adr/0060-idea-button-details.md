# 0060. Idea button details

Status: accepted

Ready ideas show their kind, known progress and a short action within the existing two-line button, with the full Goal, why and game-named Rewards on hover, as requested in the owner's live feedback. The Server supplies optional `displayKind`, `progress: { done, total }` and a localized plain-text `action` of at most 60 UTF-8 bytes; the addon only renders them, and older payloads keep their current layout. Progress describes achievement criteria, Chain quests or owned mounts from a farm's catalog list when those data are known; events and rares do not invent a completion total.
