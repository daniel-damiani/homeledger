# Contributing to HomeLedger

Thanks for your interest. HomeLedger is a self-hosted personal finance app — contributions that improve privacy, reliability, and usability are very welcome.

---

## Getting started

### Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended — runs everything)
- Or: Node 22 + Postgres 16 locally

### Dev mode (hot reload)

```bash
cp .env.example .env        # Linux / macOS
copy .env.example .env      # Windows

docker compose -f docker-compose.dev.yml up --build
```

The app reloads on file save. `WATCHPACK_POLLING=true` is set for reliable watching on Windows.

### Smoke checks (run before opening a PR)

```bash
npm run typecheck      # TypeScript — must pass with zero errors
npm run build          # Next.js production build
npm run smoke:parsers  # Parser regression tests (CSV, OFX, QFX, PDF)
```

---

## Key file map

| Path | What lives here |
|------|----------------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/app/api/` | JSON API routes (all authenticated) |
| `src/components/` | React client and server components |
| `src/lib/` | Business logic — db, auth, money, accounts, coaching, import parsers |
| `src/lib/purchase.ts` | House / car / cash planner engine (pure functions) |
| `src/lib/retirement.ts` | Monte Carlo retirement engine (pure functions) |
| `src/lib/coaching.ts` | Deterministic coach tips (pure functions, no LLM) |
| `src/lib/import/` | CSV, OFX, PDF, TXT parsers |
| `src/styles/globals.css` | All styles — single file, CSS custom properties |
| `prisma/schema.prisma` | Database schema |
| `prisma/seed.ts` | Default categories and category rules |
| `prisma/migrations/` | Timestamped SQL migrations |
| `presets/import/` | Bank CSV column-mapping presets |
| `fixtures/` | Sample statements for testing (all fake data) |
| `scripts/` | Backup/restore scripts + smoke-parser runner |
| `AGENTS.md` | Guidance for AI-assisted contributions |

---

## Making changes

### Database schema changes

1. Edit `prisma/schema.prisma`
2. Create a migration file under `prisma/migrations/YYYYMMDDHHMMSS_description/migration.sql`
3. Run `docker compose -f docker-compose.dev.yml up --build` — the entrypoint runs `prisma migrate deploy` automatically

### Adding/changing import parsers

- Parsers live in `src/lib/import/parsers.ts`
- Add a matching fixture file under `fixtures/` (fake data only — never real statements)
- Update `scripts/smoke-parsers.mjs` to cover the new format
- Run `npm run smoke:parsers` to verify

### Coaching tips

Coaching is implemented as pure deterministic functions in `src/lib/coaching.ts` — no LLM calls. New tips should follow the same pattern: query local aggregates, return a `{ title, body, severity }` object.

---

## PR expectations

- `npm run typecheck` passes with zero errors
- `npm run smoke:parsers` passes
- No real financial data in fixtures (fake data only)
- No new dependencies on paid cloud APIs (Plaid, Clerk, OpenAI, Neon, etc.)
- No secrets or `.env` files committed

---

## Reporting issues

Open a GitHub issue with:
- What you expected vs what happened
- Your OS and Docker version
- Relevant logs from `docker compose logs web`

---

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
