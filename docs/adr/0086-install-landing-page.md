# 0086. Install page as the addon landing page

Status: accepted (2026-11-09)

## Context

`/install` is four text steps and a GitHub button. It never says what problem Bory solves, shows no picture, and its fourth step about My page is outdated. The page is already indexed and in the header.

## Decision

Keep the URL `/install`; rename the header item to "Get Bory". The page order is: the problem and promise with one "Download for Windows" button and the version line; three problem-to-feature cards; a gallery of our own screenshots; three install steps with the SmartScreen screen explained and the SHA-256; manual addon zip install and what works without the Companion; trust points (Blizzard addon rules, files only in the AddOns folder, open source, what Bory knows); a visible FAQ including "Does it work in WoW Forever? Not yet, Retail only"; a final button and the Telegram link. Structured data: SoftwareApplication with `downloadUrl` on our domain, `softwareVersion`, `fileSize`, `operatingSystem`, `screenshot`, a zero-price offer, plus BreadcrumbList. No ratings until real reviews exist. Retail guides, Collections and Paths get a short "Track this in game with Bory" block linking here; Forever pages do not (ADR 0079).

Downloads and runtime release metadata use [ADR 0085](0085-download-links-on-our-domain.md). The visible FAQ supplies FAQPage JSON-LD from the same text, following ADR 0083. Copy follows ADR 0081. Windows SmartScreen instructions explain that the installer is unsigned: "More info, then Run anyway"; no signed-installer or virus-scan claim.

## Alternatives

- A new `/addon` URL with `/install` redirecting: rejected, it costs a redirect for no gain.
- A separate download page per platform: not needed with one Windows installer and one zip.

## Consequences

The gallery starts with the screenshots we already own and grows when new in-game screenshots are taken; the page must look complete with what exists today. Copy is reviewed against the README and PRIVACY.md so it promises nothing the addon does not do. Images use the existing media pipeline without cropping or edits; CSS controls fitting. The Companion reads SavedVariables in WTF and writes addon files in AddOns, so the page describes these separately rather than claiming all file access is confined to AddOns.
