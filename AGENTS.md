# AGENTS.md — HomeLedger

Guidance for coding agents working in this repository.

## Product

HomeLedger is a **private single-user** budgeting app. Run only via Docker on Windows. All financial data stays on the host (Postgres volume + optional `./backups`).

## Non-negotiables

- No Neon, Turso, Plaid, Clerk, OpenAI, or paid cloud finance/AI APIs
- Bind UI to `127.0.0.1:3000`; do not publish Postgres
- Never commit `.env`, backup dumps, or real financial files
- Brand **HomeLedger** is hero-level on unlock and home
- Signed amounts in cents; expenses negative, income positive
- Transaction dedupe: unique `(accountId, externalId)`

## Stack

Next.js 15 App Router · React 19 · TypeScript · Prisma · Postgres 16 · PIN auth (`APP_PIN` + signed cookie via `jose`) · CSV/OFX/PDF parsers · deterministic coaching rules

## Layout

- `src/app` — unlock + authenticated pages + API routes
- `src/components` — UI
- `src/lib` — db, auth, money, accounts, categorize, coaching, import/*
- `prisma` — schema, seed, migrations
- `presets/import` — bank CSV column presets
- `fixtures` — sample statements for demos/tests
- `scripts` — backup/restore + smoke-parsers

## Commands

```bash
docker compose up --build
docker compose -f docker-compose.dev.yml up --build
npm run typecheck
npm run build
npm run smoke:parsers
```

## Coaching

Implement tips as pure functions over local aggregates (overspend, goal behind, surplus sweep, dining save, credit focus). No LLM calls.

## When changing imports

Update fixtures + `scripts/smoke-parsers.mjs` so parsers stay green.