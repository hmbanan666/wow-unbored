# 0015. Item input: drop on Wisp, tooltip line, pick mode

Status: accepted (replaces the Alt+Right-click part of [0008](0008-item-and-question-help.md))

Dropping an item on Wisp is the main way to ask about it, and Wisp hints at it when the player picks one up. "What is this item?" starts a pick mode that reads the next item picked up with the cursor and puts it back; Esc cancels. There is no modifier click and no overlay on bag slots, and an unknown item goes straight to the Planner (D16-D19).
