-- ADR 0101: current Today set only. Completion is authoritative; browser hints stay local.
CREATE TABLE character_goals (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
  skill_line INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
  set_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  day BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  completed_at BIGINT,
  goal_body TEXT NOT NULL,
  PRIMARY KEY (character_id, skill_line, position)
);

-- PostgreSQL-only permissions: SQLite initialization splits at this marker.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT SELECT ON character_goals TO unbored_web;
  END IF;
END $$;
