# 0045. Connect again after Forget my data

Status: accepted

After Forget my data, the Companion shows **Connect again**. That mints a new Device id and secret, with the same id and secret checks as a first registration, and the Server approves it because the caller still holds the secret of the Device this PC forgot while it was approved. An owner revoke cannot be undone this way, and the old secret stops working. This amends [0043](0043-forget-my-data.md).
