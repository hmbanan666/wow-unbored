ALTER TABLE content.paths
  ADD COLUMN game text NOT NULL DEFAULT 'retail'
    CHECK (game IN ('retail', 'forever')),
  ADD CONSTRAINT content_game_kind CHECK (game = 'retail' OR kind = 'guide');

CREATE INDEX content_published_game ON content.paths (game, kind, published_at DESC)
  WHERE status = 'published';
