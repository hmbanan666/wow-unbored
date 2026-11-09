# 0092. Dates, prices and sizes need a primary source

Status: accepted (2026-11-09)

## Context

Pages about raids (opening 9 December 2026), riding costs and similar numbers attract many searches and go stale fast. Secondary sites already state riding prices (for example 100 gold at level 40 and 1,000 gold at 60) that we have not confirmed, and some disagree with each other on details.

## Decision

A date, price, size or level requirement is published only with a Blizzard source or our own in-game screenshot, with the check date shown. A page whose main answer lacks that (for example the mount cost page without a trainer screenshot) is not published. Pages built around a date carry a status line ("Confirmed by Blizzard on ..." or "Not announced") and are rechecked by `guide-maintain` when the date passes or a patch lands.

## Alternatives

- Publish with "reported by" labels: allowed only for secondary details, never for the page's main answer.
- Wait for full patch notes: too slow for date-driven queries; a confirmed date alone is enough to publish.

## Consequences

The raids page can ship now (Blizzard confirmed the date and raids); the mount cost page waits for a screenshot. Each page has a recheck date.
