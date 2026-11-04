-- Selected DB2 fields, keyed by build, source table, locale and record id.
CREATE TABLE game.rows (
  build TEXT NOT NULL REFERENCES game.builds(build),
  table_name TEXT NOT NULL,
  locale TEXT NOT NULL,
  id INTEGER NOT NULL,
  body JSONB NOT NULL,
  PRIMARY KEY (build, table_name, locale, id)
);
CREATE TABLE game.imports (
  build TEXT PRIMARY KEY REFERENCES game.builds(build),
  body JSONB NOT NULL
);
