-- ADR 0105: absent preference means off; public reads must check sharing live.
CREATE TABLE character_sharing (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
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
-- A boundary must survive even when no consent row exists or the previous Account is erased.
CREATE TABLE character_feed_boundaries (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id BIGINT NOT NULL
);
CREATE FUNCTION reset_character_feed_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO character_feed_boundaries (character_id, event_id)
    SELECT NEW.id, COALESCE(MAX(id), 0) FROM character_events WHERE character_id = NEW.id
    ON CONFLICT (character_id) DO UPDATE SET event_id = EXCLUDED.event_id;
  UPDATE character_sharing SET enabled = FALSE, generation = gen_random_uuid()::text,
    enabled_at = EXTRACT(epoch FROM clock_timestamp())::bigint WHERE character_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER character_feed_owner_changed AFTER UPDATE OF account_id ON characters
  FOR EACH ROW WHEN (OLD.account_id IS DISTINCT FROM NEW.account_id)
  EXECUTE FUNCTION reset_character_feed_owner();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT SELECT ON character_sharing, character_screenshots, character_feed_boundaries TO unbored_web;
  END IF;
END $$;
