# 0066. Safe Step notes for older addons

Status: accepted

The optional `X-Unbored-Addon-Version` header from the installed `Unbored.toc` wins: versions below 0.11.0 (or malformed headers) receive Step notes limited to 400 UTF-8 bytes on a character boundary, including the ellipsis, while known 0.11.0+ versions receive full notes. Without the header, infer an older addon only from a nonempty, structurally valid `currencies` v1 list with every row's `name` absent, belonging to the Device's latest accepted Character save: 0.11 added these names and refreshes currencies at login and on currency changes; named, missing, stale, empty or unfamiliar data leaves notes full. Only headerless deliveries with long notes need one query using the existing currency Section primary key, with no migration; stored Plans and payloads remain unchanged.
