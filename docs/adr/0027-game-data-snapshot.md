# 0027. Game data snapshot

Status: accepted

The addon collects every own-player source the game legally gives it into a versioned, sectioned Game data snapshot per Character and per Account (D47-D51); P0 and P1 sections ship in 0.7, P2 later. Nothing about other players is ever read (chat, mail sender/subject/body, rosters, names, combat log), nothing is read in combat, and any value where `issecretvalue(v)` is true is dropped. This supersedes the "trim to what each Request needs" parts of [0009](0009-player-data.md) and [0011](0011-server-side-player-profile.md); transparency ([0031](0031-privacy-note-and-opt-out.md)) replaces trimming.
