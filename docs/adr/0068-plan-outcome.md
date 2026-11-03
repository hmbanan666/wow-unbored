# 0068. Plan outcomes and shorter text

Status: accepted

Plans may carry one structured `outcome` with game ids and a target standing or level, never Server-supplied progress numbers; the addon can read progress live, while 0.11 safely ignores this optional field and keeps the Steps (the delivery safeguards from ADR 0066 remain for older stored Plans). Step titles are limited to 70 characters and 240 UTF-8 bytes for older addons, optional reasons to 80 bytes, Step notes to 400 bytes and Plan details to 200 bytes: excess text is shortened at a word with a warning, never a reason to reject the Plan. Place names and points must come from game data or be omitted: correct quest points farther than 5% of the same map from a known quest point, drop unsupported travel points, and retain the starting-position rule from ADR 0065; unavailable tables remain explicitly unknown.
