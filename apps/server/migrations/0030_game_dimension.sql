ALTER TABLE game.builds ADD COLUMN game TEXT NOT NULL DEFAULT 'retail' CHECK (game IN ('retail', 'forever'));
ALTER TABLE game.achievements ADD COLUMN game TEXT NOT NULL DEFAULT 'retail' CHECK (game IN ('retail', 'forever'));
ALTER TABLE game.rows ADD COLUMN game TEXT NOT NULL DEFAULT 'retail' CHECK (game IN ('retail', 'forever'));
ALTER TABLE game.imports ADD COLUMN game TEXT NOT NULL DEFAULT 'retail' CHECK (game IN ('retail', 'forever'));
ALTER TABLE game.quest_names ADD COLUMN game TEXT NOT NULL DEFAULT 'retail' CHECK (game IN ('retail', 'forever'));
ALTER TABLE game.watch ADD COLUMN game TEXT NOT NULL DEFAULT 'retail' CHECK (game IN ('retail', 'forever'));
ALTER TABLE game.achievements DROP CONSTRAINT achievements_build_fkey;
ALTER TABLE game.rows DROP CONSTRAINT rows_build_fkey;
ALTER TABLE game.imports DROP CONSTRAINT imports_build_fkey;
ALTER TABLE game.quest_names DROP CONSTRAINT quest_names_build_fkey;
ALTER TABLE game.builds DROP CONSTRAINT builds_pkey;
ALTER TABLE game.builds ADD PRIMARY KEY (game, build);
ALTER TABLE game.achievements DROP CONSTRAINT achievements_pkey;
ALTER TABLE game.achievements ADD PRIMARY KEY (game, build, id);
ALTER TABLE game.rows DROP CONSTRAINT rows_pkey;
ALTER TABLE game.rows ADD PRIMARY KEY (game, build, table_name, locale, id);
ALTER TABLE game.imports DROP CONSTRAINT imports_pkey;
ALTER TABLE game.imports ADD PRIMARY KEY (game, build);
ALTER TABLE game.quest_names DROP CONSTRAINT quest_names_pkey;
ALTER TABLE game.quest_names ADD PRIMARY KEY (game, build, id, locale);
ALTER TABLE game.watch DROP CONSTRAINT watch_pkey;
ALTER TABLE game.watch ADD PRIMARY KEY (game, id);
ALTER TABLE game.builds DROP CONSTRAINT builds_build_number_key;
ALTER TABLE game.builds ADD UNIQUE (game, build_number);
ALTER TABLE game.achievements ADD FOREIGN KEY (game, build) REFERENCES game.builds(game, build);
ALTER TABLE game.rows ADD FOREIGN KEY (game, build) REFERENCES game.builds(game, build);
ALTER TABLE game.imports ADD FOREIGN KEY (game, build) REFERENCES game.builds(game, build);
ALTER TABLE game.quest_names ADD FOREIGN KEY (game, build) REFERENCES game.builds(game, build);
CREATE TABLE game.profession_recipes (
  game TEXT NOT NULL, build TEXT NOT NULL, skill_line INTEGER NOT NULL, spell_id INTEGER NOT NULL,
  body JSONB NOT NULL, PRIMARY KEY (game, build, skill_line, spell_id),
  FOREIGN KEY (game, build) REFERENCES game.builds(game, build)
);
