# 0033. Request flow state machine, ETA, lock while waiting

Status: accepted

One state machine in `UnboredCharDB.request.state` (`idle -> quick -> survey -> confirm -> queued|sent -> waiting -> ready -> offer -> idle`, plus `failed` and `expired`) drives the Bubble with one primary button per state; Send now is the Refresh click that writes the Request and reloads, and the state resumes after reload, logout or character switch (D65, D66, D70). While waiting Wisp is locked to the waiting Bubble and shows an ETA from the Server's planner p50 (default 180 s, clamp 60-900 s) written by the Companion, then offers one Refresh; 10 min taking long, 15 min no Companion and 60 min expired (D67-D69). "Thinking" is a slow alpha pulse on one portrait texture whose animations are created once and only played or stopped (D71). This amends [0012](0012-reload-free-background-refresh.md) and [0018](0018-glossary-and-waits.md) where they differ.
