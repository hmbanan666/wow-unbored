# 0001. SavedVariables bridge

Status: accepted

The addon has no network. The Companion reads SavedVariables and writes its own `Unbored_Plan` addon (`Plan.lua`), so data moves only on a UI reload, and every reload comes from a user click: a Preset or Send saves the Request and runs ReloadUI, and Load runs ReloadUI. No memory or pixel reading, and no automated reloads.
