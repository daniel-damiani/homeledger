# HomeLedger

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-blue)](docker-compose.yml)
[![Stack](https://img.shields.io/badge/stack-Next.js%2015%20%2B%20Postgres-black)](package.json)

**HomeLedger** is a private, self-hosted personal finance app. Your statements, balances, budgets, goals, and plans live on your own machine — no Plaid, no cloud accounts, no subscription.

Connect to [SimpleFIN Bridge](https://bridge.simplefin.org/) for automatic bank sync (~$1.50/mo), or import CSV/OFX/PDF files from any bank.

---

## Features

| Area | What you get |
|------|-------------|
| **Accounts** | Checking, savings, credit, investment, loan — grouped by type, net worth on the home page |
| **Import** | CSV · OFX/QFX · PDF · TXT with column mapping, preset detection, dedupe, and one-click undo |
| **SimpleFIN sync** | Live bank balance + transaction sync for supported institutions |
| **Categorize** | Queue + "always categorize as" rules — teach it once, it learns |
| **Spending tracker** | Weekly and monthly views, category/payee breakdowns, donut chart, cumulative chart |
| **Budgets** | Per-category/month limits, copy-previous, 80% warnings, overspend alerts |
| **Goals** | Target amounts, suggested contribution, surplus sweep, progress tracking |
| **Recurring payments** | Define regular bills; auto-applied to the ledger on due date |
| **Forecast** | 60-day cashflow projection based on income schedule and spending patterns |
| **Reconciliation** | Compare cleared transactions against your bank statement balance per account |
| **Net worth chart** | 12-month sparkline on the home dashboard |
| **Buy planner** | House · car · cash purchase planning tied to your actual spend and liquid assets |
| **Retire planner** | Monte Carlo retirement projection using your real ledger as the baseline |
| **Coach tips** | Deterministic rule-based nudges — overspend alerts, goal pacing, surplus sweep |
| **Chat** | Optional local-only AI assistant via [Ollama](https://ollama.com/) (llama3.2 or similar) |
| **Security** | PIN + signed JWT session cookie, idle auto-lock, no external auth services |

---

## Quick start

> **Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine.

```bash
# 1. Clone and enter the project
git clone https://github.com/daniel-damiani/homeledger.git
cd homeledger

# 2. Create your env file (edit APP_PIN and SESSION_SECRET)
cp .env.example .env   # Windows: copy .env.example .env

# 3. Start the app
docker compose up --build
```

Open **http://localhost:3000**, unlock with your PIN (default `1234` — change it in Settings), then:

1. Create an account under **Accounts**
2. Import → upload `fixtures/sample-chase.csv` to explore with sample data
3. Connect SimpleFIN under **Settings → SimpleFIN** for live sync

**Stop:** `Ctrl+C` or `docker compose down`. Your data persists in the `homeledger_pg` Docker volume.

### Dev mode (hot reload)

```bash
docker compose -f docker-compose.dev.yml up --build
```

File changes reflect immediately — no rebuild needed.

---

## Backup and restore

```bash
# Backup (writes to ./backups/)
./scripts/backup.sh          # Linux / macOS
.\scripts\backup.ps1         # Windows

# Restore
./scripts/restore.sh -d ./backups/homeledger-YYYYMMDD-HHMMSS.sql
.\scripts\restore.ps1 -DumpFile .\backups\homeledger-YYYYMMDD-HHMMSS.sql
```

Never commit backup dumps or real statement files — both are gitignored.

---

## Configuration

All settings are in `.env` (copy from `.env.example`):

| Variable | Purpose |
|---|---|
| `APP_PIN` | Login PIN (change this) |
| `SESSION_SECRET` | JWT signing secret — use a long random string |
| `CURRENCY` | Display currency, e.g. `USD` |
| `OLLAMA_BASE_URL` | Local Ollama endpoint (optional — only needed for AI chat) |
| `OLLAMA_MODEL` | Model to use, e.g. `llama3.2` (optional) |
| `SIMPLEFIN_TOKEN` | Optional — can also be entered via the app UI |

---

## Security notes

- UI binds to `localhost:3000` only by default. Postgres is not published to the host.
- PIN is bcrypt-hashed in the database — never stored in plaintext.
- Session expires after 15 minutes of inactivity (configurable).
- SimpleFIN Access URLs (bearer credentials) are stored in the local Postgres — protect your database.
- **Do not expose this app to the internet without additional hardening** (HTTPS, authentication proxy, firewall rules).

---

## Smoke checks

```bash
npm run typecheck
npm run build
npm run smoke:parsers
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Roadmap

- Account-level cleared/reconciliation ✓ (shipped)
- Net worth chart ✓ (shipped)
- Split transactions (one receipt → multiple categories)
- Transaction tags
- Mobile companion app (API is already JSON; bearer token auth needed)
- Optional hosted tier for non-technical users

---

## License

[MIT](LICENSE) — free to use, modify, and self-host.
