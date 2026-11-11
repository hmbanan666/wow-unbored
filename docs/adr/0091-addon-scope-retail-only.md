# 0091. The addon stays Retail-only this week; Forever pages do not sell it

Status: superseded by 0094 (2026-11-11)

## Context

Most search demand this week is for WoW Forever, but the addon declares only Retail interfaces (120100 to 120107), and Forever uses interface 16001 with a Classic-based API. The Server's Game DB, Plans and Suggestions are built on Retail data (renown, delves, Midnight zones). Pointing Forever readers to an installer that does nothing in their game would cost trust.

## Decision

No Forever build of the addon this week. Forever pages keep no install prompt (ADR 0079); they offer the Telegram channel for news instead. The install page and catalog listings say "Retail only for now". Installs are driven by Retail pages, catalogs and community posts. A Forever port gets its own ADR once the owner decides to take it on, with the scope (ideas from the quest log and camping, no Retail data) written first.

## Alternatives

- Add interface 16001 to the TOC now: rejected, the addon would load into an API and data set it was not built for and break.
- Push the addon on Forever pages anyway: rejected, it misleads readers.

## Consequences

Forever traffic grows the brand and the Telegram audience but not installs. Install growth depends on Retail pages, catalogs and posts, which the plan schedules.
