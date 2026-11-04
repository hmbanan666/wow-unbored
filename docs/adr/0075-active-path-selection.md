# 0075. Active Path selection

Status: accepted

A Character's active Path stores its kind, slug and language and follows that identity's latest published version; a Request keeps the exact published version shown by the picked Idea so later publishing or selection changes do not change the player's pick. Selection can be replaced or cleared through the authenticated API and owner tools, survives completion, and is erased with the Character; a completed or unavailable Path offers no Continue Idea. The Continue Idea comes first with current required-goal progress, uses a distinct `path` kind that older addons ignore, and enters the existing Request confirmation flow.
