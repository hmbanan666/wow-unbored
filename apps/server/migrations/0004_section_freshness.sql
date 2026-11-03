-- ADR 0063: compare existing Sections by their own read time.
UPDATE sections_latest SET saved_at = at WHERE at IS NOT NULL;
