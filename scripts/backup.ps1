# Backup HomeLedger Postgres from Docker Compose
param(
  [string]$OutDir = ".\backups"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutDir "homeledger-$stamp.sql"

Write-Host "Dumping to $out ..."
docker compose exec -T db pg_dump -U homeledger -d homeledger --clean --if-exists | Set-Content -Path $out -Encoding utf8
Write-Host "Done: $out"