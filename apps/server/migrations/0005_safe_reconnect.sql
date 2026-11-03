ALTER TABLE devices ADD COLUMN reconnect_from TEXT;
CREATE UNIQUE INDEX devices_reconnect_from ON devices (reconnect_from);
