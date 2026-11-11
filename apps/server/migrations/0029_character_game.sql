ALTER TABLE characters ADD COLUMN game text NOT NULL DEFAULT 'retail'
  CHECK (game IN ('retail', 'forever'));
ALTER TABLE history ADD COLUMN game text NOT NULL DEFAULT 'retail'
  CHECK (game IN ('retail', 'forever'));
CREATE INDEX characters_game_name_realm ON characters (game, name, realm);
ALTER TABLE requests ADD COLUMN game text NOT NULL DEFAULT 'retail'
  CHECK (game IN ('retail', 'forever'));
