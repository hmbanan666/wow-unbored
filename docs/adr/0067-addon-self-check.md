# 0067. In-game self-check

Status: accepted

Settings offers a one-click Self-check outside combat: a single registry probes unverified read-only APIs and isolated addon-owned animation objects, recording only result shapes and the game build; state-changing calls and asynchronous or visual behaviour remain explicitly marked for manual verification. One bounded diagnostic row (`where = "selfcheck"`, details in `stack`, up to 8,000 bytes) uses the existing account `errors` Section and owner errors list, stays local with sharing off, and waits for a natural save without reloading. Normal API usage is unchanged, and all result values, unknown field names, secret values and raw exception messages are omitted.
