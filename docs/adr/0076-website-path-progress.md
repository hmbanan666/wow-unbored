# 0076. Personal Path progress on public pages

Status: accepted

The website renders public content without personal data and loads per-Character progress through private, non-cacheable requests after mounting; Server routes authenticate the live website session, derive its Account, and reuse the existing progress and active Path services. Website selection requires same-origin JSON and per-session/per-address limits; replacing another active Path requires confirmation of the current identity under the Account lock, so a concurrent change asks again. Session credentials stay server-only, and goal markers are shown only when the public page and personal progress refer to the same published version.
