# SPEC.md — HomeLedger

## Mission

Private single-user budgeting: import statements, know where money is, track spending/budgets, coach savings goals with a **deterministic rules engine** (no cloud AI). Brand: **HomeLedger**.

## Constraints

| Constraint | Detail |
|------------|--------|
| Cost | $0 runtime: Docker Desktop + local Postgres |
| APIs | No Neon, Turso, Plaid, Clerk, OpenAI, paid finance/AI |
| Data | On host via Docker volume; optional `./backups` bind mount |
| Network | UI `127.0.0.1:3000` only; Postgres private |
| Secrets | Never commit `.env`, dumps, real statements |

## Data model

- **AppSettings** — pinHash, currency, monthStartDay, onboarded
- **Account** — name, type, balanceCents, institution
- **Category** / **CategoryRule** — taxonomy + payee pattern rules
- **Transaction** — signed amountCents; unique accountId+externalId
- **Budget** — categoryId + YYYY-MM + limitCents
- **Goal** — target/current cents, status, optional targetDate
- **ImportBatch** — filename, counts, undo flag

## Auth

`APP_PIN` hashed (bcrypt) into AppSettings. Session: signed JWT cookie (`SESSION_SECRET`), httpOnly, sameSite=lax, path=/. Logout clears cookie. Settings can rotate PIN.

## Import

Formats: CSV, OFX/QFX, PDF, TXT. Flow: upload → detect → preview → map columns (CSV) → apply amount sign → commit with categorization rules → dedupe skips → undo batch deletes imported txs and restores balances.

Presets: generic, chase, amex, capital-one, bank-of-america.

## Coaching tips (required)

1. Category overspend vs budget
2. Goal behind schedule
3. Monthly surplus → suggest sweep to goal
4. Dining high vs grocery baseline
5. Credit balance focus (pay down)

## Success path

1. `copy .env.example .env`
2. `docker compose up --build`
3. Unlock → create account → import `fixtures/sample-chase.csv`
4. Budgets/goals/coach usable
5. `.\scripts\backup.ps1` produces a dump under `./backups`

## Out of scope

Multi-user SaaS, public hosting, Plaid, cloud DB, native mobile, trading, paid AI.