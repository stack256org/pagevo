<div align="center">

# Pagevo

**A Notion-style team workspace you host yourself.**

Pages, a block editor, databases with four views, comments, permissions and sharing,
real-time notifications, templates, and an instance admin panel — pre-assembled for
small teams, running on your own server so your team's content stays with you.

[![CI](https://github.com/sahajtavethiya96/Workflik/actions/workflows/ci.yml/badge.svg)](https://github.com/sahajtavethiya96/Workflik/actions/workflows/ci.yml)
[![Release](https://github.com/sahajtavethiya96/Workflik/actions/workflows/release.yml/badge.svg)](https://github.com/sahajtavethiya96/Workflik/actions/workflows/release.yml)
[![Docker build sanity check](https://github.com/sahajtavethiya96/Workflik/actions/workflows/docker-build.yml/badge.svg)](https://github.com/sahajtavethiya96/Workflik/actions/workflows/docker-build.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

[Quick start](#quick-start) · [Running it with Docker](#running-it-with-docker) · [Docs](doc/README.md) · [Contributing](#contributing)

</div>

---

## Contents

- [What you get](#what-you-get)
- [Built with](#built-with)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Running it with Docker](#running-it-with-docker)
- [Continuous integration & releases](#continuous-integration--releases)
- [Health checks](#health-checks)
- [Backups](#backups)
- [Roles](#roles)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## What you get

- **Pages, nested without limit.** Everything is a block — text, media, tasks, code,
  tables, embedded databases — with `/` slash commands, markdown shortcuts, drag-and-drop
  reordering, and 200-step undo.
- **Databases with four views.** Table, Board (kanban), Calendar and Gallery, backed by
  typed properties (text, number, select, date, person, relation, and more), filters,
  sorts and grouping.
- **Comments and mentions.** Block-level, text-anchored, and page-level threads;
  `@person`, `@page`, and `@date` mentions.
- **Permissions and sharing.** Workspace roles (Admin/Editor/Viewer) plus per-page
  overrides, public share links, and guest access for people outside your workspace.
- **Real-time notifications**, delivered over Server-Sent Events, with in-app and
  configurable email delivery (real-time, daily digest, weekly digest, or off).
- **Templates** — a built-in library plus workspace-scoped custom templates.
- **Global search** across pages, database entries and comments, filtered by what the
  searching user can actually see.
- **Orbit**, an instance admin panel for platform operators: user and workspace
  management, built-in template management, analytics, and an append-only audit trail.

Full feature-by-feature detail is in [doc/README.md](doc/README.md) and
[doc/Features/](doc/Features/).

---

## Built with

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL |
| Database access | Drizzle ORM |
| Sign-in | Better Auth (email + password, magic link, Google) |
| Editor | TipTap (ProseMirror) |
| Styling | Tailwind CSS v4 + daisyUI + Headless UI |
| Email | Nodemailer over SMTP |
| Background jobs | pg-boss |
| File storage | Local disk, or any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, …) |
| Real-time updates | Server-Sent Events |

---

## Quick start

### Docker (recommended)

**You need:** Docker, and nothing else — no Node.js, no PostgreSQL to install
separately.

```bash
git clone <your-fork-url> pagevo
cd pagevo
cp .env.example .env      # set APP_SECRET (openssl rand -base64 32) and NEXT_PUBLIC_APP_URL
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
docker compose run --rm migrate
```

Open `http://localhost:3000`. No SMTP configured yet? Every outgoing email, including
sign-in links, is written to the worker's log instead of sent — enough to try the whole
product before setting up mail:

```bash
docker compose logs -f worker
```

Prefer to skip building locally? Use published images instead — see
[Running it with Docker](#running-it-with-docker).

### Manual / Node

**You need:** Node.js 22+, pnpm 11+, and PostgreSQL 16+ (or use the bundled embedded
Postgres below).

```bash
git clone <your-fork-url> pagevo
cd pagevo
pnpm install
cp .env.example .env      # set APP_SECRET and NEXT_PUBLIC_APP_URL

pnpm db:local              # optional: starts an embedded Postgres on :5432
pnpm db:migrate            # apply the schema
pnpm dev                   # runs the Next.js app + the pg-boss worker together
```

Open `http://localhost:3000`. The first account created bootstraps the instance and is
promoted to platform admin automatically.

**Full setup guide:** [SELF-HOSTING.md](SELF-HOSTING.md) — every credential option
(including third-party database providers, S3/R2/MinIO, SMTP alternatives, Google
sign-in), environment variables, reverse-proxy notes, and troubleshooting.

---

## Environment variables

Only three are required; everything else has a working default or is optional. The
full annotated list is in [`.env.example`](.env.example) and
[SELF-HOSTING.md §11](SELF-HOSTING.md#11-environment-variables--full-reference).

| Variable | What it is |
|----------|------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_SECRET` | Random secret used to sign sessions and encrypt stored integration secrets. 32 characters minimum — generate with `openssl rand -base64 32`. |
| `NEXT_PUBLIC_APP_URL` | The public web address of your install, e.g. `https://team.yourco.com`. Every email link is built from it. |

Everything else — SMTP, Google sign-in, file storage driver, public registration — is
optional, has a sane default, and can also be set from **Orbit Admin → Integrations**
instead of `.env` once the instance is running.

---

## Running it with Docker

Four compose files, meant to be combined with `-f`, not used interchangeably:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | The base stack — Postgres, `app`, `worker`, `migrate`. Builds from source by default. **Always included.** |
| `docker-compose.local.yml` | Publishes the app on `http://localhost:HOST_PORT` for running without a reverse proxy. Omit it behind Dokploy/Traefik/Caddy/nginx, which reach the app over the Docker network instead. |
| `docker-compose.external-db.yml` | Points `app`/`worker`/`migrate` at a third-party Postgres (Neon, Supabase, RDS, …) instead of the bundled one. |
| `docker-compose.images.yml` | Uses prebuilt images from GitHub Container Registry instead of building locally — see below. |

### The normal way (builds from source)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
docker compose run --rm migrate
```

### Using prebuilt images

CI publishes versioned app/migrator/worker images to GitHub Container Registry on
every merge to `main` (see [Continuous integration & releases](#continuous-integration--releases)).
To run one without building:

```bash
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
docker compose run --rm migrate
```

Pin a version in production, since `latest` moves with every release:

```bash
IMAGE_TAG=0.1.0 docker compose -f docker-compose.yml -f docker-compose.images.yml pull
```

Available tags: `latest`, the version ladder (`0` / `0.1` / `0.1.0`, once a release
exists), `main` (rebuilt on every push, expect rough edges), and a fixed `sha-<short>`
per build — each built for both Intel and ARM.

### With your own database

```bash
docker compose -f docker-compose.yml -f docker-compose.external-db.yml \
  -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.external-db.yml run --rm migrate
```

Full walkthrough, including managed-provider gotchas: [SELF-HOSTING.md §4](SELF-HOSTING.md#4-database--every-option).

### Where your data lives

| Volume | Holds |
|--------|-------|
| `postgres_data` | Everything: pages, blocks, permissions, comments, sessions, the audit log, and the job queue |
| `uploads` | Attachments, on the default `local` storage driver only — unnecessary on S3/R2/MinIO |

Both are named volumes and survive `down`, `pull`, `build`, and `up -d`. Only
`docker compose down -v`, or removing a volume by hand, destroys them.

### Updating

```bash
git pull
docker compose up -d --build   # or pull + up, on docker-compose.images.yml
docker compose run --rm migrate
```

Back up first — see [Backups](#backups) — and check [CHANGELOG.md](CHANGELOG.md) for
anything needing manual work.

---

## Continuous integration & releases

- **[`ci.yml`](.github/workflows/ci.yml)** runs on every push and pull request:
  typecheck, lint (Biome), the Vitest suite, a production build, and a migrations
  check that applies every migration against a real, ephemeral Postgres and fails if
  the schema changed without a generated migration.
- **[`docker-build.yml`](.github/workflows/docker-build.yml)** builds the app, migrator
  and worker images (both `amd64` and `arm64`, no push) on every pull request, and
  validates `docker-compose.yml`.
- **[`release.yml`](.github/workflows/release.yml)** runs after CI succeeds on `main`.
  It always builds and pushes the three images to GitHub Container Registry, tagged
  `main` and `sha-<short>`. If `package.json`'s `version` has no matching git tag yet,
  it additionally tags `v<version>`, publishes a GitHub Release with notes from
  [CHANGELOG.md](CHANGELOG.md), and adds the full version ladder (`X`, `X.Y`, `X.Y.Z`,
  `latest`) to the image tags.

Cutting a release is: bump `version` in `package.json`, add the matching
`## [X.Y.Z]` section to `CHANGELOG.md`, commit, push to `main`. Nothing to tag by hand.

---

## Health checks

`GET /api/health` needs no authentication and reports whether the app can reach its
database:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"ok","version":"0.1.0"}
```

It returns `503` with `"database":"unreachable"` when the database is down, so load
balancers and uptime monitors can use it directly. `version` reports which build a
container is running (stamped at image build time), or `"dev"` for a local,
non-Docker build. The Docker image bakes in this check as its own `HEALTHCHECK`, so
`docker compose ps` / `docker run` report real health with no extra configuration.
The worker has its own file-based heartbeat check instead, since it isn't a web server.

---

## Backups

Backups are not automatic — set them up yourself. Always back up the **PostgreSQL
database**; also back up the **`uploads` volume** if you're on the default `local`
storage driver (unnecessary on S3/R2/MinIO). Full commands and a recovery walkthrough:
[SELF-HOSTING.md §14](SELF-HOSTING.md#14-backup--data-ownership).

---

## Roles

| Role | How someone gets it |
|------|---------------------|
| Viewer / Editor | A workspace admin invites them, or they join via an invite link. |
| Workspace Admin | Owner by default when they create a workspace, or promoted by another admin. |
| Platform Admin (Orbit) | Automatic for the very first account on a fresh instance; every account after that needs `pnpm make:admin you@example.com` (or the Docker equivalent below) — there is no in-app self-assign path. |

```bash
# Docker
docker compose exec app pnpm make:admin you@example.com

# Manual / Node
pnpm make:admin you@example.com
```

---

## Documentation

| Topic | Document |
|-------|----------|
| Self-hosting setup, every credential option | [SELF-HOSTING.md](SELF-HOSTING.md) |
| Product spec — features, one file per area | [doc/README.md](doc/README.md), [doc/Features/](doc/Features/) |
| Engineering conventions & hard rules | [doc/CLAUDE.md](doc/CLAUDE.md) |
| Database schema | [doc/DATABASE-PLAN.md](doc/DATABASE-PLAN.md) |
| Backend architecture, background jobs | [doc/docs/architecture/](doc/docs/architecture/) |
| Security model | [doc/docs/security.md](doc/docs/security.md) |
| SaaS → self-hosted conversion notes | [SAAS-TO-SELF-HOSTED.md](SAAS-TO-SELF-HOSTED.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

---

## Contributing

Contributions are welcome. Read [doc/CLAUDE.md](doc/CLAUDE.md) first — it documents
the architecture invariants and UI conventions every change is expected to follow.
For anything beyond a small fix, open an issue first to discuss the approach.
[CONTRIBUTING.md](CONTRIBUTING.md) covers the project layout, conventions, and getting
a development environment running. Everyone taking part is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

Before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

---

## Security

Pagevo handles authentication, passwords, and workspace data. If you find a security
vulnerability, please **don't** open a public issue — see [SECURITY.md](SECURITY.md)
for how to report it privately.

Since you're running your own instance, you're also responsible for the security of
your own deployment — keep `APP_SECRET` and your database/SMTP/S3 credentials out of
source control and up to date, and see [SECURITY.md](SECURITY.md) for the notes on
what's your responsibility versus the application's.

---

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

You're free to run, modify, and self-host Pagevo. If you distribute a modified
version as a network service, you must make your changes' source available too.
