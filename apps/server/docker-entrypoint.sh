#!/bin/sh
# Dokploy mounts the data volume as root. Chown it, then drop to the node
# user so SQLite can write. The image stays root only for this step.
set -eu
data="${UNBORED_DATA_DIR:-/data}"
case "$data" in
  /*) ;;
  *)
    echo "UNBORED_DATA_DIR must be an absolute path." >&2
    exit 1
    ;;
esac
if [ "$data" = "/" ]; then
  echo "Refusing to change ownership of /." >&2
  exit 1
fi
mkdir -p "$data"
chown -R node:node "$data"
if [ "$(id -u)" = 0 ]; then
  exec setpriv --reuid=node --regid=node --init-groups --inh-caps=-all "$@"
fi
exec "$@"
