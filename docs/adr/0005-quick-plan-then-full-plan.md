# 0005. Quick plan, then Full plan

Status: accepted

A Preset click builds a Quick plan locally at once (first Step in under a minute) and sends a Request in the same click; the Full plan arrives within about 5 minutes. After Load, Wisp asks "better plan ready, load it in?" instead of replacing the Quick plan silently, and Steps already finished carry over. Later the Planner moves to an LLM on the Server.
