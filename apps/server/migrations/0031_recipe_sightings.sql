-- ADR 0097: account ownership stays private; only source facts are aggregated.
CREATE TABLE recipe_sightings (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('retail', 'forever')),
  kind TEXT NOT NULL CHECK (kind IN ('trainer', 'vendor')),
  source_key TEXT NOT NULL,
  spell_id INTEGER,
  recipe_spell_id INTEGER,
  item_id INTEGER,
  skill_line INTEGER,
  recipe_name TEXT,
  locale TEXT,
  npc_id INTEGER NOT NULL,
  npc_name TEXT NOT NULL,
  ui_map_id INTEGER,
  x REAL,
  y REAL,
  cost BIGINT,
  required_skill INTEGER,
  limited INTEGER NOT NULL CHECK (limited IN (0, 1)),
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, game, kind, npc_id, source_key)
);
CREATE INDEX recipe_sightings_game ON recipe_sightings (game, skill_line);
CREATE INDEX recipe_sightings_item ON recipe_sightings (game, item_id) WHERE kind = 'vendor';

-- PostgreSQL-only permissions: SQLite reuses the table and indexes above.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT USAGE ON SCHEMA game TO unbored_web;
    GRANT SELECT ON game.builds, game.rows, game.profession_recipes TO unbored_web;
    GRANT SELECT ON recipe_sightings TO unbored_web;
  END IF;
END $$;
