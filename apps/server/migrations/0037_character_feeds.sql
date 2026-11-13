-- ADR 0105: absent preference means off; public reads must check sharing live.
CREATE TABLE character_sharing (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  history_after BIGINT NOT NULL DEFAULT 0,
  realm_slug TEXT NOT NULL,
  name_slug TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at BIGINT NOT NULL,
  generation TEXT NOT NULL,
  UNIQUE (realm_slug, name_slug)
);
CREATE TABLE character_screenshots (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  at BIGINT NOT NULL,
  hash TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  variants JSONB NOT NULL,
  UNIQUE (character_id, account_id, hash)
);
CREATE INDEX character_screenshots_timeline ON character_screenshots (character_id, at DESC, id DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT SELECT ON character_sharing, character_screenshots TO unbored_web;
  END IF;
END $$;
