# 0037. No time budget on Plans

Status: accepted

Plans have no time budget: presets, the Survey and the request flow ask no minutes, and `budget` is optional in the Request and Plan contracts, sent only when the player fills the optional minutes field in the custom "Something else..." form (D81). The Planner covers the whole goal in ordered Steps, all of them, and Step minute estimates are information only. This amends [0013](0013-request-contract-and-reason-codes.md) and [0033](0033-request-flow-state-machine.md).
