-- Repair future freshness keys left by 0004, using the ingestion clock allowance.
UPDATE sections_latest
SET saved_at = floor(extract(epoch FROM now()))::bigint + 300
WHERE saved_at > floor(extract(epoch FROM now()))::bigint + 300;
