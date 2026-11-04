-- Guides are authored Article pages next to Paths and Collections
-- (docs/site-structure.md). Same table, same versions, a third kind.
ALTER TABLE content.paths DROP CONSTRAINT IF EXISTS paths_kind_check;
ALTER TABLE content.paths ADD CONSTRAINT paths_kind_check
  CHECK (kind IN ('path', 'collection', 'guide'));
