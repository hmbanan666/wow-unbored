# 0050. Updater key rotation

Status: accepted

0.9.0 is still signed with the old updater key but embeds the new public key, and the release dry run fails if the embedded key differs from `apps/companion/src-tauri/updater-pubkey-v2.pub`. After every known install runs 0.9, the bot owner swaps the signing secret; an install that skipped 0.9 then needs one manual reinstall (D151-D152).
