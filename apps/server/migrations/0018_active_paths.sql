-- Selection follows the latest published version of the same content identity.
CREATE TABLE active_paths (
  character_id text PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('path', 'collection')),
  slug text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en', 'ru'))
);
