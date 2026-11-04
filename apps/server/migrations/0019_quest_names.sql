-- Localized Blizzard quest titles, kept separate from imported client tables.
CREATE TABLE game.quest_names (
  build TEXT NOT NULL REFERENCES game.builds(build),
  id INTEGER NOT NULL,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (build, id, locale)
);
