#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${1:?Usage: restore.sh path/to/dump.sql}"
echo "Restoring from $DUMP ..."
docker compose -f "$ROOT/docker-compose.yml" exec -T db psql -U homeledger -d homeledger < "$DUMP"
echo "Restore complete."