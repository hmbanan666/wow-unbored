# 0031. Privacy note and data opt-out

Status: accepted

README has "What Wisp knows about you" in English and Russian, the Companion first-run screen links to it, and `docs/DEVELOPMENT.md` lists every Section (D61). The Wisp setting "Share game data to make Wisp smarter" is on by default; off writes only `char`, `gear`, `questLog` and `sessions`, and the owner-only MCP `delete_account_data` erases an Account (D62). A real consent flow comes with the public site.
