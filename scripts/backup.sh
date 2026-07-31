#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/homeledger-$STAMP.sql"
echo "Dumping to $OUT ..."
docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_dump -U homeledger -d homeledger --clean --if-exists > "$OUT"
echo "Done: $OUT"