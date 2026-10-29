# 0026. One release tag

Status: accepted

One tag `vX.Y.Z` is the release. It carries the Companion installer, the addon zip, and the updater files, and the addon, Companion, and Server share that version. Separate `companion-v*` tags stop. Release notes stay as in [0022](0022-releases-and-docs.md): an Install / Download section, then git-cliff groups, now for every scope in that one release. Installed Companions from 0.5 and 0.6 keep updating because they still read `https://github.com/hmbanan666/wow-unbored/releases/download/companion-updater/latest.json`; each release copies `latest.json` there, signed with the same minisign key. That feed was read on 29 October 2026 and returned version 0.6.0 with the Windows installer URL and a signature.
