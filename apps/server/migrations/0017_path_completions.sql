-- The once-per-Character/version guard survives Player history retention.
-- Character erasure (including Forget my data) removes the guard too.
CREATE TABLE path_completions (
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  content_id bigint NOT NULL REFERENCES content.paths(id),
  at bigint NOT NULL,
  PRIMARY KEY (character_id, content_id)
);
