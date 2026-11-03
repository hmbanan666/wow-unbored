# 0066. Safe Step notes for older addons

Status: accepted

The Companion sends the installed addon version from `Unbored.toc` in the optional `X-Unbored-Addon-Version` header on Plan and Request reads, because snapshots and Device records have no reliable version field. At delivery only, the Server limits each Step note to 400 UTF-8 bytes on a character boundary, including an ellipsis when it fits, for versions below 0.11.0 or missing or malformed versions from older clients. Known versions 0.11.0 and newer receive full notes; stored Plans and the shared Plan payload remain unchanged.
