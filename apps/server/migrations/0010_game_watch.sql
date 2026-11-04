CREATE TABLE game.watch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  live_build TEXT,
  pending_since BIGINT,
  checked_at BIGINT,
  last_error TEXT
);
