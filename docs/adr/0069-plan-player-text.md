# 0069. Plans omit planner limitations

Status: accepted

Player-facing Plan text states actions and omits unavailable directions, points, data, sources and tool limitations without explaining the omission. Plan submissions return field-specific rewrite warnings for English and Russian planner-talk phrases, using whole-word boundaries to avoid substring matches in game names; the existing warning loop allows correction in the same session without rejecting the Plan.
