# 0085. Download links on our domain

Status: accepted (2026-11-09)

## Context

The install button points to the GitHub release page, which lists seven files (setup.exe, msi, two .sig files, latest.json, release.json, the addon zip). v0.13.0 had 3 setup.exe downloads. Players should click one button on playunbored.com and get the right file. The Companion's updater keeps reading the `companion-updater` release feed.

## Decision

- `GET /download/windows` answers 302 with the `*_x64-setup.exe` asset of the latest published release; `/download/addon` answers with `Unbored-v*.zip`; `/download/windows-msi` with the msi.
- The web server reads `https://api.github.com/repos/hmbanan666/wow-unbored/releases/latest` without a token, caches the result in memory for 10 minutes, and on any error redirects to the releases page. A request timeout bounds the wait.
- `/install` shows the version, size, release date and SHA-256 (the asset `digest`) from the same cached answer.
- Each redirect writes one structured log line in the web server (event `download`, time, asset, version, referring path on our site). No IP address, no user agent, no cookie, no database table for now.
- The updater feed is unchanged.

## Alternatives

- Mirror the files on the `unbored-media` volume: rejected. Windows SmartScreen reputation follows the code signature and file hash, not the host, so a mirror does not remove the warning; it adds a CI copy step, disk use and a second source that can drift from the updater.
- Link straight to the GitHub asset URL with a hard-coded version: rejected, it breaks on every release.
- A Cloudflare or proxy rewrite: rejected, it hides the logic outside the repository.

## Consequences

One small Nitro route and a log line; a counter table can come later if logs are not enough. GitHub rate limits are not a concern with a 10-minute cache. The download stays the same artifact the updater uses. The installer is not Authenticode signed; updater signatures do not remove the SmartScreen warning. [ADR 0086](0086-install-landing-page.md) explains this on the install page.
