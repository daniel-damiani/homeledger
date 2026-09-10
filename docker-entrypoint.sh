#!/bin/bash
set -euo pipefail

echo "[homeledger] waiting for database..."
until pg_isready -h db -U homeledger -d homeledger >/dev/null 2>&1; do
  sleep 1
done

echo "[homeledger] running migrations..."
npx prisma migrate deploy

echo "[homeledger] seeding (idempotent)..."
npx tsx prisma/seed.ts || true

echo "[homeledger] starting Next.js..."
exec node server.js
