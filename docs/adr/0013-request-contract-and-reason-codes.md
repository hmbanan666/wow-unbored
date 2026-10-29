# 0013. Request contract and Reason codes

Status: accepted

The Companion sends `mode` and `budget` only for plan Requests and the Server treats an empty or null mode as absent for item and question Requests; one shared set of contract fixtures is tested by both sides. Every failure carries a Reason code (`not_approved`, `companion_offline`, `server_unreachable`, `rejected`, `timeout`, `planner_failed`) that Wisp turns into a friendly line, never raw text, and the Server logs one line per request without secrets (D9-D12).
