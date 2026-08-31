# Agent Documentation

This is Pagevo, a self-hosted, open-source Notion-style team workspace. For AI agents and contributors working in this repo:

- **Engineering conventions and hard rules**: [doc/CLAUDE.md](doc/CLAUDE.md) — read this before making any change. It covers architecture invariants (closure tables, permission resolution, background jobs), UI design rules, and 39 hard rules that are easy to violate by accident.
- **Product spec**: [doc/README.md](doc/README.md) — full feature list, tech stack, database schema overview.
- **Self-hosting setup**: [SELF-HOSTING.md](SELF-HOSTING.md) — how to run an instance, every credential's alternatives, environment variables.
- **SaaS → self-hosted conversion status**: [SAAS-TO-SELF-HOSTED.md](SAAS-TO-SELF-HOSTED.md) — what's been changed and why, useful context for understanding recent architecture decisions.
- **Contributing, CI and releases**: [CONTRIBUTING.md](CONTRIBUTING.md) — project layout and required checks (`pnpm typecheck`/`lint`/`test`/`build`, also enforced by [`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Releases are cut by bumping `version` in `package.json` and adding a matching section to [CHANGELOG.md](CHANGELOG.md) — see [`.github/workflows/release.yml`](.github/workflows/release.yml).
