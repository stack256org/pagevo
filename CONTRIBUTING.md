# Contributing to Pagevo

Thanks for your interest in contributing! Pagevo is an open-source, self-hostable
Notion-style team workspace built with Next.js, Drizzle ORM, and Postgres.

## Getting started

**Prerequisites:** Node.js 22+, pnpm 11+, and either Docker or a local Postgres.

```bash
git clone <your-fork-url>
cd pagevo
pnpm install
cp .env.example .env          # fill in APP_SECRET (32+ chars) and NEXT_PUBLIC_APP_URL
```

You can run Postgres locally without Docker using the embedded dev database:

```bash
pnpm db:local                 # starts an embedded Postgres on port 5432
pnpm db:generate              # build migration SQL from the Drizzle schema (only if you changed lib/db/schema/)
pnpm db:migrate               # apply migrations to the database
pnpm dev                      # runs Next.js + the background worker together
```

Open http://localhost:3000. The first account created bootstraps the instance and is
promoted to Platform Admin automatically. See [SELF-HOSTING.md](SELF-HOSTING.md) for
every setup path (Docker, manual, third-party database, S3/R2 storage, SMTP) and
[GETTING-STARTED.md](doc/GETTING-STARTED.md) for a walkthrough.

## Project layout

```
app/            Next.js App Router — routes, layouts, API route handlers
components/     UI (daisyUI + Headless UI primitives in components/ui)
lib/            db client, auth, permissions, storage, email, background jobs
lib/db/schema/  Drizzle schema, one file per domain
drizzle/        generated SQL migrations — never hand-edit these
scripts/        dev-db, migrate, reset, make-admin, worker entrypoints
tests/          Vitest — pure-function tests only, see Conventions below
doc/            product specs (Features/), architecture & security docs (docs/)
config/         instance-level runtime configuration
```

## Conventions

Read [doc/CLAUDE.md](doc/CLAUDE.md) before making any non-trivial change — it is the
authoritative index of architecture invariants (closure-table page hierarchy,
permission resolution order, background-job rules) and UI conventions, with 40 hard
rules that are easy to violate by accident if you haven't read it. The short version:

- **TypeScript everywhere.** Run `pnpm typecheck` before pushing — it must pass.
- **Lint/format with Biome:** `pnpm lint` (check) / `pnpm lint:fix` (autofix).
- **Tests:** `pnpm test` (Vitest, in `tests/`). The suite deliberately covers
  pure functions only — secret encryption at rest and small UI helpers today.
  Adding a test there should never require a database or a network call.
- **Path alias:** always `@/...` for in-repo imports, never relative `./`/`../`.
- **Permissions:** resolve access through the shared resolver
  (`requireSession` → `requireWorkspaceMember` → `requirePagePermission`). Never
  filter restricted rows in application code after a broad fetch.
- **Background jobs:** slow, retryable, or scheduled work goes through the pg-boss
  worker (`lib/jobs/`) — never inline in a Next.js request.
- **Database:** edit `lib/db/schema/*.ts`, then `pnpm db:generate` and
  `pnpm db:migrate`. **Commit the generated migration** — CI fails if the schema
  changed without one.
- **New env var:** add it to `lib/env.ts` (Zod-validated) and to `.env.example`.
  Never read `process.env` directly elsewhere.
- **UI:** daisyUI semantic tokens and the five-step radius scale, no shadows, no
  hardcoded colors — see doc/CLAUDE.md's UI rules for the full checklist before any
  UI PR.

## Making a change

1. Create a branch off `main`.
2. Make your change; keep it focused. Update the relevant doc under `doc/` if
   behavior changes (doc/CLAUDE.md rule 1).
3. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. CI runs all
   four plus a migrations check against a real Postgres — see
   [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
4. If you touched the Docker setup, `docker compose -f docker-compose.yml
   -f docker-compose.local.yml up -d --build` should still come up clean —
   [`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml)
   checks this on every pull request too.
5. Open a pull request describing **what** changed and **why**. Screenshots help
   for UI.

## Reporting bugs / requesting features

Open an issue with clear steps to reproduce (for bugs) or the problem you're trying
to solve (for features). Please check existing issues first.

**Security vulnerabilities don't go in issues** — see [SECURITY.md](SECURITY.md).

Everyone participating here is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

By contributing, you agree your contributions are licensed under the same license as
this project (AGPL-3.0-or-later — see [LICENSE](LICENSE)).
