# Changelog

Notable changes to Pagevo. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pagevo is below 1.0.0, so a minor version bump can still contain a breaking change.
Anything needing manual work on upgrade is called out under **Upgrade notes**.

## [Unreleased]

### Added

- CI: typecheck, lint, a Vitest suite, a production build, and a Postgres-backed
  migrations check now gate every push and pull request
  ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
- Release automation: on a green CI run on `main`, `release.yml` builds and
  publishes the app, migrator and worker images to GitHub Container Registry,
  then tags and publishes a GitHub Release from this file when `package.json`'s
  version is new ([`.github/workflows/release.yml`](.github/workflows/release.yml)).
- `docker-compose.images.yml`, an override for running published GHCR images
  instead of building from source.
- `GET /api/health` now reports `database` and `version` (the running build's
  version, stamped via the `APP_VERSION` build arg) alongside `status`.
- `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`.
- A small Vitest suite (`tests/`) covering the pure functions worth testing
  without a database: secret encryption at rest (`lib/crypto.ts`) and a couple
  of UI helpers (`lib/utils.ts`).

## [0.1.0] - 2026-08-26

Initial self-hosted release of Pagevo — a Notion-style team workspace: block
editor, four database views (Table/Board/Calendar/Gallery), comments and
mentions, workspace/page permissions and sharing, real-time notifications,
templates, and an instance admin panel (Orbit). See
[doc/README.md](doc/README.md) for the full feature list and
[SELF-HOSTING.md](SELF-HOSTING.md) for the setup guide.
