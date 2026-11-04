CREATE SCHEMA game;
CREATE TABLE game.builds (
  build TEXT PRIMARY KEY,
  build_number INTEGER NOT NULL UNIQUE,
  imported_at BIGINT NOT NULL,
  achievements INTEGER NOT NULL
);
CREATE TABLE game.achievements (
  build TEXT NOT NULL REFERENCES game.builds(build),
  id INTEGER NOT NULL,
  name_en TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  PRIMARY KEY (build, id)
);
