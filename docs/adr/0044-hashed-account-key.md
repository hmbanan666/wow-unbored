# 0044. Hashed Account key

Status: accepted

The Companion hashes the Account key before it sends it (D58): SHA-256 over the per-install salt, a zero byte, and the WTF folder name with the license suffix removed. The salt stays on that PC. The Server renames existing rows when an upload still carries the old key once (`accountLegacy`), and it keeps accepting an unhashed key from an older Companion. This amends [0029](0029-snapshot-upload-and-history.md).
