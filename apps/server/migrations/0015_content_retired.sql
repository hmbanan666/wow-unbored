-- Publishing a new version retires the old one (ADR 0072): it stays readable
-- history, but only one row per page is published.
ALTER TABLE content.paths DROP CONSTRAINT IF EXISTS paths_status_check;
ALTER TABLE content.paths ADD CONSTRAINT paths_status_check
  CHECK (status IN ('draft', 'published', 'retired'));
