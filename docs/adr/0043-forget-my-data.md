# 0043. Forget my data

Status: accepted

A player erases their data from the Companion (Advanced, **Forget my data**, one confirm): `POST /v1/devices/me/forget`, authenticated only by the device secret in any pairing status, erases every Account that device sent and that Account's Requests and plans, the same set as the owner's `delete_account_data`, then revokes the device so nothing more is stored from it. The Companion empties the plan, advice and ideas files it wrote; the addon's own SavedVariables stay on the PC. Coming back is **Connect again** on this PC ([0045](0045-connect-again.md), [PRIVACY.md](../../PRIVACY.md)), not another owner approval. This amends D62 in [decisions-v0.7](../decisions-v0.7.md), which had no player-side erasure.
