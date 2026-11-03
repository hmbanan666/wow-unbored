# 0064. Damaged Companion settings

Status: accepted

When an existing settings file cannot be read or parsed, the Companion preserves it beside the original as `settings.json.bad-<UTC timestamp>` (Unix seconds and nanoseconds, with a suffix on collision) without replacing any earlier backup, starts with defaults, and shows one dismissible notice in English or Russian naming the backup. A missing settings file stays silent; if preservation fails, the notice explains that no copy was saved and the original is protected from settings writes.
