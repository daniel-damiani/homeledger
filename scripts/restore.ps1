# Restore HomeLedger Postgres dump into Compose db
param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $DumpFile)) {
  throw "Dump file not found: $DumpFile"
}

Write-Host "Restoring from $DumpFile ..."
Get-Content -Raw -Path $DumpFile | docker compose exec -T db psql -U homeledger -d homeledger
Write-Host "Restore complete."