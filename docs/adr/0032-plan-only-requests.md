# 0032. Server Requests are plan-only

Status: accepted

From 0.7 the addon sends only `plan` Requests, after a short Survey; item and free-text questions are answered locally and the Server types `item` and `question` stay in the contract only for old addons (D64). This amends [0008](0008-item-and-question-help.md), [0014](0014-ask-is-core.md) and [0015](0015-item-input.md): Ask and item drop stay, but their fuller Answers no longer go through the Planner.
