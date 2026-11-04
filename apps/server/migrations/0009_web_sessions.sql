-- Sign-in links and site sessions (ADR 0073). Single use, 10 minutes.
-- Outside `public`, so the SQLite transfer does not copy them. SQLite tests
-- create the same tables without a schema when a link is issued.

CREATE TABLE web.sign_in_links (
  token_hash text PRIMARY KEY,
  device_id text NOT NULL,
  account_id text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  used_at bigint
);
CREATE INDEX web_sign_in_links_device ON web.sign_in_links (device_id);

CREATE TABLE web.sessions (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  device_id text NOT NULL,
  created_at bigint NOT NULL,
  ended_at bigint
);
CREATE INDEX web_sessions_account ON web.sessions (account_id);
