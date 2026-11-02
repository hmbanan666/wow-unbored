CREATE TABLE IF NOT EXISTS runner_jobs (
  request_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('queued', 'leased', 'done', 'handed_off', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at BIGINT NOT NULL,
  lease_id TEXT UNIQUE,
  lease_token_hash TEXT UNIQUE,
  leased_until BIGINT,
  attempt_started_at BIGINT,
  prompt_version TEXT,
  last_error TEXT,
  queued_at BIGINT NOT NULL,
  claimed_at BIGINT,
  finished_at BIGINT
);
CREATE INDEX IF NOT EXISTS runner_jobs_due ON runner_jobs (state, available_at, leased_until, queued_at);
