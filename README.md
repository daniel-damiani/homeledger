# HomeLedger

Private, single-user budgeting that runs entirely on your Windows machine via Docker.

**HomeLedger** keeps your statements, balances, budgets, and goals on local Postgres. No Neon, Plaid, Clerk, or cloud AI — just Docker Desktop and a PIN.

## Quick start (Windows)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and ensure it is running.
2. Clone this repo and open a terminal in the project folder.
3. Copy env and start:

```powershell
copy .env.example .env
docker compose up --build
```

4. Open **http://127.0.0.1:3000**
5. Unlock with PIN `1234` (change it under Settings).
6. Create an account → **Import** → upload `fixtures/sample-chase.csv`.

Stop with `Ctrl+C` or `docker compose down`. Data stays in the Docker volume `homeledger_pg`.

### Dev mode (hot reload)

```powershell
copy .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

`WATCHPACK_POLLING=true` is set for reliable file watching on Windows.

## What you get

| Area | Features |
|------|----------|
| Unlock | PIN + signed cookie session |
| Home | Net worth, budget progress, next goal, cashflow, coach tips |
| Accounts | CRUD, balances, manual transactions |
| Import | CSV / OFX / QFX / PDF / TXT with preview, presets, dedupe, undo |
| Categorize | Queue + “always categorize like this” rules |
| Spending | Month view, category/payee breakdowns, CSV export |
| Budgets | Per category/month, copy previous, 80%/over warnings |
| Goals | Targets, suggested contribution, surplus sweep, coach tips |
| Ops | `/api/health`, backup/restore scripts |

## Backup & restore

```powershell
.\scripts\backup.ps1
.\scripts\restore.ps1 -DumpFile .\backups\homeledger-YYYYMMDD-HHMMSS.sql
```

Bash equivalents: `scripts/backup.sh`, `scripts/restore.sh`.

Backups write to `./backups` (gitignored contents). Never commit dumps or real statements.

## Smoke checks

Inside the running web container or with local Node after `npm install`:

```bash
npm run typecheck
npm run build
npm run smoke:parsers
```

## Security notes

- UI binds to `127.0.0.1:3000` only.
- Postgres is not published to the host.
- Money data never leaves the machine when you use this stack as documented.
- Change `APP_PIN` and `SESSION_SECRET` in `.env`.

## Docs for agents

See [AGENTS.md](./AGENTS.md) and [SPEC.md](./SPEC.md).

## Out of scope

Multi-user SaaS, public hosting, Plaid, cloud databases, native mobile, trading, paid AI.