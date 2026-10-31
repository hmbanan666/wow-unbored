# 0029. Snapshot upload and Server storage with Section history

Status: accepted

On every SavedVariables write the Companion hashes each Section and uploads only changed ones, gzip, to `POST /v1/snapshot` (4 MB compressed cap); the Server also maps the old `POST /v1/profile` to Sections and stores unknown Sections raw (D56, D63). The Server keeps `accounts`, `characters`, `sections_latest` and `section_history`, where history holds added/removed ids for Packed id sets, count diffs for bags and full bodies for small Sections; old `profiles`/`profile_snapshots` are backfilled once (D57). The Account key stayed the WTF folder name in 0.7 (D58). [0044](0044-hashed-account-key.md) hashes it on the Companion.
