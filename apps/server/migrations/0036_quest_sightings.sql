-- ADR 0104: retain ownership for erasure, expose only aggregated quest facts.
CREATE TABLE quest_sightings (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  game TEXT NOT NULL CHECK (game = 'forever'),
  quest_id INTEGER NOT NULL CHECK (quest_id > 0),
  kind TEXT NOT NULL CHECK (kind IN ('accept', 'turnIn', 'completed')),
  title TEXT,
  level INTEGER,
  npc_id INTEGER,
  npc_name TEXT,
  ui_map_id INTEGER,
  x REAL,
  y REAL,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  PRIMARY KEY (account_id, game, quest_id, kind)
);
CREATE INDEX quest_sightings_game ON quest_sightings (game, quest_id);
CREATE TABLE game.quest_slugs (
  game TEXT NOT NULL,
  quest_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  PRIMARY KEY (game, quest_id),
  UNIQUE (game, slug)
);
CREATE TABLE game.quest_chains (
  game TEXT NOT NULL CHECK (game = 'forever'),
  slug TEXT NOT NULL,
  body JSONB NOT NULL,
  PRIMARY KEY (game, slug)
);

-- PostgreSQL-only permissions and triggers.
CREATE FUNCTION game.reserve_quest_slug() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base TEXT := trim(both '-' from regexp_replace(lower(NEW.title COLLATE "C"), '[^a-z0-9]+', '-', 'g'));
  candidate TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('quest-slugs:' || NEW.game));
  IF EXISTS (SELECT 1 FROM game.quest_slugs WHERE game = NEW.game AND quest_id = NEW.quest_id) THEN RETURN NEW; END IF;
  IF base IS NULL OR base = '' THEN base := 'quest-' || NEW.quest_id; END IF;
  -- The chain index namespace must never become a quest address.
  IF base = 'chains' THEN base := base || '-' || NEW.quest_id; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM game.quest_slugs WHERE game = NEW.game AND slug = candidate) LOOP
    candidate := candidate || '-' || NEW.quest_id;
  END LOOP;
  INSERT INTO game.quest_slugs VALUES (NEW.game, NEW.quest_id, candidate);
  RETURN NEW;
END $$;
CREATE TRIGGER quest_slug_on_sighting AFTER INSERT OR UPDATE ON quest_sightings
FOR EACH ROW EXECUTE FUNCTION game.reserve_quest_slug();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT USAGE ON SCHEMA game TO unbored_web;
    GRANT SELECT ON quest_sightings, game.quest_slugs, game.quest_chains TO unbored_web;
  END IF;
END $$;
