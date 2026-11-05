-- NULL identifies files written before pipeline versions were recorded.
ALTER TABLE content.media ADD COLUMN pipeline_version integer;
