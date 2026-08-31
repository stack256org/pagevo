# Security Policy

## Supported versions

Pagevo is pre-1.0. Security fixes land on `main` and in the next tagged release; there
are no long-term support branches yet. If you are self-hosting, run a recent tag.

| Version | Supported |
|---------|-----------|
| `main` / latest release | ✅ |
| Older tags | ❌ — upgrade |

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**

Report it privately, either way:

- **Preferred:** GitHub's private vulnerability reporting —
  [Security → Report a vulnerability](../../security/advisories/new)
- **Alternative:** contact a repository maintainer directly through GitHub.

Helpful to include: affected version or commit, deployment shape (bundled Postgres vs
external, storage driver), reproduction steps or a proof of concept, and what an
attacker gets out of it.

### What to expect

- **Acknowledgement** within 5 business days.
- An assessment and a rough fix timeline after triage.
- Credit in the release notes and advisory, unless you'd rather stay anonymous.

This is a small volunteer-maintained project — there is no bug bounty. Please give us a
reasonable window to ship a fix before disclosing publicly.

## Scope

In scope: anything in this repository — the Next.js app, the pg-boss worker, the
authentication and permission model, the Docker images and Compose files published
from here.

Out of scope:

- Vulnerabilities in third-party dependencies with no exploitable path through
  Pagevo — report those upstream (Dependabot already watches our lockfile).
- Findings that require an already-compromised host, database, or admin account.
- Misconfiguration of *your own* deployment: a weak or default `APP_SECRET`, a
  publicly exposed Postgres port, running without TLS, a world-readable `.env`.
- Missing hardening headers or rate limits with no demonstrated impact.
- Reports generated wholesale by an automated scanner with no verified exploit path.

## Notes for self-hosters

A few things are your responsibility, not the application's, and are worth checking
before you go live:

- `APP_SECRET` must be 32+ genuinely random characters, unique per deployment. It
  signs sessions and encrypts stored integration secrets (`lib/crypto.ts`) — a
  guessable one is game over.
- Terminate TLS in front of the app (Nginx, Caddy, Traefik, or your platform's proxy).
  `NEXT_PUBLIC_APP_URL` should be the `https://` URL.
- Never expose the Postgres port publicly. `docker-compose.yml` publishes `5432` to
  the host for local convenience — firewall it, or remove the `ports:` mapping, on
  any host reachable from the internet.
- Registration is invite-only by default after the instance's first account
  bootstraps it (`ALLOW_PUBLIC_REGISTRATION=false`). Only turn on open self-serve
  signup if you actually want that.
- Uploaded files on the default `local` storage driver live in the `uploads` Docker
  volume. Back it up the same way you back up the database — see
  [SELF-HOSTING.md §14](SELF-HOSTING.md#14-backup--data-ownership).
- Platform-admin access (`/orbit`) has no in-app self-assign path beyond the
  instance's first account — every other grant goes through `pnpm make:admin` or a
  direct database update. Treat that command and direct DB access accordingly.
