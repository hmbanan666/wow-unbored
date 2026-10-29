# 0012. Reload-free: local first, clipboard bridge, prefetch

Status: accepted (supersedes [0001](0001-savedvariables-bridge.md))

Normal interaction never reloads the UI: Wisp answers locally first, and a Server round trip goes through the Clipboard bridge (the player copies an `UNBQ1:` string, the Companion posts it and puts the `UNBA1:` Answer back on the clipboard only while our own string is still there, the player pastes it on Wisp). The clipboard carries only the Request id and minimal text; profiles and big things (Full plans, Personal advice) arrive by Prefetch at natural loads, and Wisp may offer one "Refresh now?" Bubble for them, never per message. The LoadOnDemand mailbox trick, chat log, whispers, addon messages and the combat log are rejected as channels (decisions D1-D8).
