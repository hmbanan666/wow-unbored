CREATE TABLE content.media (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_kind text NOT NULL,
  ref_id integer,
  role text NOT NULL CHECK (role IN ('icon', 'render', 'tile', 'image')),
  source text NOT NULL CHECK (source IN ('blizzard', 'own')),
  source_url text,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{16}$'),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  variants jsonb NOT NULL,
  name text NOT NULL DEFAULT '',
  alt text NOT NULL,
  overrides jsonb NOT NULL DEFAULT '{}',
  fetched_at bigint NOT NULL,
  checked_at bigint NOT NULL,
  CHECK ((source = 'own' AND role = 'image' AND ref_id IS NULL) OR
         (source = 'blizzard' AND ref_id > 0 AND source_url IS NOT NULL))
);
CREATE UNIQUE INDEX media_blizzard_ref ON content.media (ref_kind, ref_id, role) WHERE source = 'blizzard';
CREATE UNIQUE INDEX media_own_hash ON content.media (hash, role) WHERE source = 'own';
CREATE INDEX media_refresh ON content.media (checked_at) WHERE source = 'blizzard';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT SELECT ON content.media TO unbored_web;
  END IF;
END $$;
