# 0062. Connect again keeps the old key until the new one is used

Status: accepted

Connect again ([0045](0045-connect-again.md)) becomes safe to repeat. The Companion saves the new Device id and secret as a pending credential before it calls the Server, and the Server keeps the forgotten Device eligible for Connect again until the new Device has authenticated once with its own secret. A lost reply, a crash or a failed disk write leaves the player with a key that still works, so they never have to pair again because of a network blip. This amends [0045](0045-connect-again.md).

## Why

- Connect again only exists after Forget my data: the old Device is already revoked with `forget_revoked = 1`. `POST /v1/devices/me/reconnect` inserts the new approved Device and clears `forget_revoked` on the old one in the same call, while the Companion writes `device.json` only after the reply (`connect_again` in `gui.rs`, `TODO(audit)`). If the reply is lost or the write fails, a retry with the old secret gets `403`, the new secret is gone, the player must ask for a manual approval, and the Server keeps an orphan Device.

## Shape

- Server, reconnect (same route, same request body):
  - Creates the new Device as today, marked unconfirmed (`reconnect_from = <old id>`), and leaves the old Device's `forget_revoked = 1`.
  - Idempotent: the same old secret with the same new id and secret hash returns the existing new Device with `201`. A different new id while the previous one is still unconfirmed deletes the unconfirmed one (it never authenticated) and creates the new one. Once a new Device is confirmed, the old secret gets today's `403`.
- Server, confirm: the first request authenticated with the new secret (`GET /v1/devices/me`, which every Companion already polls, an upload, a Request) confirms it: clear `reconnect_from` and set the old Device's `forget_revoked = 0`, in one transaction. No new endpoint, so 0.11 Companions, which save the secret after the reply and then poll, end up clean without an update.
- Expiry: an unconfirmed new Device older than 24 h is deleted by the existing periodic cleanup; the old Device stays eligible.
- Owner revoke and Forget my data on either side behave as today and also revoke an unconfirmed partner. An owner revoke cannot be undone by Connect again (as in 0045).
- Companion, Connect again:
  1. Mint the new credential (`rotate_keeping_salt`) and write `device.pending.json` next to `device.json` (same permissions, atomic write). If that write fails, stop; nothing was sent.
  2. Call reconnect with the old secret.
  3. On `201`: confirm the pending secret with `GET /v1/devices/me`; only `200` with a non-revoked status permits atomically replacing `device.json`, updating Credential Manager and deleting `device.pending.json`. A transport failure or `5xx` leaves both files untouched for startup recovery; this also applies after recovery repeats reconnect.
- Companion, start: if `device.pending.json` exists, try its secret with `GET /v1/devices/me`. `200`: adopt it (replace `device.json`, delete pending). `401`: repeat step 2 with the old secret (idempotent), then step 3. A `403` on the old secret too: delete pending and show the normal pairing screen.
- Logs: `device reconnect old=<id8> new=<id8> pending`, `... confirmed`, `... expired`. Never secrets or hashes.

## Considered options

- A separate confirm endpoint: explicit, but old Companions would never call it; the first authenticated request is the same proof and needs no client change.
- A grace window for the old secret without confirmation: simpler, but a crash outside the window still loses the key, and nothing proves the Companion really holds the new secret.

## Consequences

- One nullable column `devices.reconnect_from` (SQLite and Postgres migration), one cleanup rule. docs/companion-api.md describes the retry rule.
- Tests: lost reply then retry with the same and with a different new id; crash after the pending write; crash after `device.json` before any poll; confirm through `GET /v1/devices/me` and through an upload; a 0.11-style flow (no pending file); expiry; owner revoke and Forget on either side during pending.
