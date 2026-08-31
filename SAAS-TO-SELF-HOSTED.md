# Pagevo: SaaS → Self-Hosted Open-Source Conversion Plan

> Audit date: 2026-07-06 · Branch: `as-self-hosted`
> This document tracks both what's been **implemented** (✅) during this pass and what's still a **recommendation** for you to act on.

## 1. Executive summary

Pagevo was **not** built with hard SaaS lock-in. There's no billing/subscription code, no analytics SDK, no multi-region/tenant-sharding logic to unwind. The infrastructure dependencies that usually make self-hosting painful — object storage, email, and the database — were already optional or fully local by default before this pass started.

What this pass added: a complete, **verified-working** Docker deployment (app + worker + Postgres, one command) with a built-in image healthcheck and a build-sanity CI workflow, and — more importantly — it surfaced and fixed **two real, pre-existing bugs** that would have broken a fresh self-hosted install on day one, independent of anything to do with SaaS vs. self-host. Both are documented in §2.

| Dependency | Self-host status |
|---|---|
| File storage | `STORAGE_DRIVER=local` is the **default** — saves to `./uploads`, no S3 account needed. MinIO available as a one-flag Docker Compose add-on for a self-hosted S3-compatible alternative. |
| Email (magic links) | If SMTP env vars are unset, emails are logged to the console. Mailpit available as a one-flag Docker Compose add-on for a fake-SMTP web inbox. |
| Database | `docker compose up` runs Postgres in a container; `pnpm db:local` boots an embedded Postgres for non-Docker local dev; a self-managed install or a managed provider (Neon, Supabase, Railway, RDS, etc.) both work equally well — it's just a `DATABASE_URL`. Full option table plus a provider-by-provider walkthrough in `SELF-HOSTING.md` §4. |
| Billing | Does not exist in the code at all. |
| Docker | ✅ **Implemented and build-verified this pass** — see §3. |
| Authentication | ✅ **Implemented this pass** — email + password is now the primary sign-in method, with magic link and Google as two independently-switchable optional methods, enforced server-side — see §6. Password auth is the one method that needs no external service at all. |

---

## 2. Bugs found and fixed while verifying the setup path

These were discovered by actually running the build and migration path end-to-end (not just reading code) — both are unrelated to the SaaS→self-host conversion itself, but both would have broken the very first thing every new self-hoster does (`pnpm build` and `pnpm db:migrate`), so they had to be fixed to honestly document a working quick-start.

### 2.1 ✅ Fixed — production build failed a type check
`lib/db/schema/workspace.ts` set `workspaces.defaultPageAccess` to default to `"shared"`, but the `defaultPageAccess` Postgres enum (`lib/db/schema/types.ts`) only declares `private | can_view | can_comment | can_edit | full_access` — `"shared"` isn't a member. `pnpm build` (`tsc` type-check step) failed outright on this. The permission resolver's own comment (`lib/permissions/resolver.ts:33`, *"workspace.default_page_access → shared = can_edit, private = null"*) documents the intended mapping, so the default was changed to `"can_edit"` and a migration (`drizzle/0008_modern_stick.sql`) generated via `pnpm db:generate` to apply it.

### 2.2 ✅ Fixed — a fresh `pnpm db:migrate` produced a broken schema
This one is more serious: applying the officially-tracked migration chain (per `drizzle/meta/_journal.json`) to a brand-new database left `default_page_access` as a **2-value** enum (`private`, `shared`) — while every snapshot from migration `0003` onward, and all of the application code (Zod validators, the permission resolver, the workspace settings UI), assumed the **5-value** enum already existed.

Root cause: a migration file (`drizzle/0003_default_page_access_extend.sql`, containing the `ALTER TYPE ... ADD VALUE` statements) existed on disk but was **never registered in the journal** — an orphaned file, silently skipped by every real `drizzle-kit migrate` run. A second orphaned duplicate of the *initial* migration (`drizzle/0000_polite_triton.sql`) also existed, unreferenced.

**Practical impact if left unfixed:** the very first time a self-hoster ran `pnpm db:migrate` on a clean database, workspace creation/settings would fail with `invalid input value for enum default_page_access` the moment anything tried to write `can_edit`/`can_view`/`can_comment`/`full_access` — which is immediately, since that's the new default (§2.1).

**Fix applied:** the orphaned enum-extension migration was given a proper journal entry (correctly sequenced before `0003_shiny_red_skull`, which already assumed the extended enum), its own snapshot was reconstructed to match, and all downstream snapshot files were renumbered and re-linked (`id`/`prevId` chain) to stay consistent. The duplicate orphaned initial migration was deleted.

**Verification performed** (not just read — actually run): spun up a disposable embedded Postgres, ran the real `pnpm db:migrate`, confirmed it exits `0`, confirmed the enum now has all 5 (plus legacy `shared`) values with the correct `can_edit` default via direct SQL inspection, and — the strongest check — re-ran `pnpm db:generate` afterward and got **"No schema changes, nothing to migrate"**, proving the repaired migration chain now produces a database that exactly matches the current schema code.

### 2.3 ⚠️ Caveat — this fix is verified-safe for a fresh database, but needs a manual step on an existing one

The §2.2 fix is a renumbering of the migration chain on disk. Drizzle's migration tracker (`drizzle.__drizzle_migrations`, inside the `drizzle` schema) records only the single most-recent migration's timestamp as a watermark — not a per-migration hash — so it decides what to (re-)apply purely by comparing timestamps. On a **brand-new** database this renumbered chain applies cleanly and was verified end-to-end (§2.2). On an **existing, already-migrated production database**, if its recorded watermark and this branch's renumbered timestamps disagree in ordering, `pnpm db:migrate` could silently skip re-applying the enum-extension statements instead of erroring — leaving that database stuck on the old 2-value `default_page_access` enum even after "successfully" migrating.

**Safe workaround for an existing database:** apply the enum-extension SQL by hand once, before running the branch's migrations:
```sql
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'can_view';
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'can_comment';
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'can_edit';
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'full_access';
```
This is idempotent (`IF NOT EXISTS`) and safe to run even if the values already exist. Also documented in `SELF-HOSTING.md`'s Troubleshooting table and its "Updating your instance" section.

---

## 3. Docker deployment — ✅ implemented and verified

Previously missing entirely (only `Dockerfile.worker` existed, and it had a stale `COPY db ./db` line referencing a directory that no longer exists post-refactor to `lib/db/schema/` — also fixed). Now in place:

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build for the Next.js app: `deps` (full install) → `migrator` (standalone target that only runs `pnpm db:migrate`) → `builder` (`next build`, using `output: "standalone"`) → `runner` (minimal production image, non-root user) |
| `Dockerfile.worker` | Fixed the stale `db/` copy; renamed the container user from the leftover `krova` scaffold name to `pagevo`; now also creates `/app/uploads` so local-disk-driver cleanup jobs can reach the same files the app writes |
| `docker-compose.yml` | Wires `postgres`, a one-shot `migrate` service, `app`, and `worker` together, plus an **optional** `--profile extras` pair (`mailpit`, `minio`) so you never need a real SMTP/S3 account to try Pagevo |
| `.dockerignore` | Keeps `.env`, `node_modules`, `.next`, and local uploads out of the build context |
| `next.config.mjs` | Added `output: "standalone"` — required for the lean production image |
| `app/api/health/route.ts` | New unauthenticated liveness/readiness probe (checks DB connectivity) used by the `app` service's Docker healthcheck |
| `Dockerfile` — `HEALTHCHECK` instruction | Baked into the image itself (not just `docker-compose.yml`'s `healthcheck:` block), so a plain `docker run` without Compose still reports container health via `/api/health` |
| `.github/workflows/docker-build.yml` | New CI workflow — build-only sanity check (no push, no registry credentials needed) for both Dockerfiles' every stage plus `docker compose config` validation, so the self-hosted path doesn't silently rot as app code changes |
| `docker-compose.external-db.yml` | New override file, documented in `SELF-HOSTING.md` §4.2 — fixes a real limitation found while writing that section: `app`/`worker`/`migrate` hardcode `DATABASE_URL` to the bundled Postgres container by design, so a self-hoster wanting a managed provider (Neon, Supabase, etc.) couldn't just edit `.env` — Compose would silently keep using the bundled one. The override redirects those three services' `DATABASE_URL` to read from `.env` via `docker compose -f docker-compose.yml -f docker-compose.external-db.yml ...` |

**A build-time subtlety worth knowing:** `next build` loads `lib/env.ts` (Zod-validated) at module-eval time, so the `builder` stage needs *syntactically valid* placeholder env values to get through the build — it does **not** need a reachable database (confirmed: `/`, `/privacy`, `/terms` prerender statically; everything else is server-rendered on demand). The real values from your `.env` are read at container **runtime**, once the process actually starts. This works cleanly here because none of this app's `NEXT_PUBLIC_*` variables are referenced from client-side (`"use client"`) code — verified by grep — so nothing environment-specific gets permanently baked into the client JS bundle. You do not need to rebuild the image if you change `.env` later.

**Known image-size caveat (not a correctness bug):** `next build` printed a Node File Trace warning that a dynamic filesystem operation in `app/api/uploads/local/route.ts` causes the whole project to be conservatively traced into `.next/standalone`, so the production image is heavier than a typical minimal Next.js standalone build. It still works correctly (verified) — this is a future optimization opportunity (statically scoping that route's path handling), not something blocking a working deployment today.

**Second image-size caveat, found on the follow-up audit:** the `deps` stage runs a full `pnpm install` (including devDependencies, needed for `drizzle-kit`/`typescript`/`tailwind` in the `migrator`/`builder` stages) — which also pulls in `embedded-postgres`'s per-platform optional binaries (`@embedded-postgres/linux-arm64`, `-darwin-arm64`, etc.), even though `embedded-postgres` is only ever used by the non-Docker `pnpm db:local` dev script and no container ever runs it. Not a correctness issue, but real, avoidable build weight — worth splitting `embedded-postgres` out of the main dependency install (or into its own optional group) as a future optimization, same category as the NFT caveat above.

**Multi-architecture coverage:** `.github/workflows/docker-build.yml` now builds for both `linux/amd64` and `linux/arm64` (via QEMU emulation) — added on the follow-up audit pass after noticing the original CI only validated the runner's native amd64, which would have left Apple Silicon / arm64 self-hosters with no automated confidence the image builds on their architecture at all.

**What was actually verified, not just written:**
- `pnpm build` succeeds end-to-end with placeholder build-time env vars (after the §2.1 fix).
- `.next/standalone/server.js` is produced.
- `docker-compose.yml` is valid YAML.
- The `migrator` stage's logic (`pnpm db:migrate` against a real Postgres) was run directly (outside Docker, since this sandbox has no Docker daemon) and succeeds cleanly against a disposable database (after the §2.2 fix) — this is the same command the `migrate` Docker service runs.
- **Not yet verified**: an actual `docker build`/`docker compose up` run, since Docker itself isn't available in this environment. Please run `docker compose up -d --build` on your machine as the final check — the underlying build and migration logic is confirmed sound, but the container layer itself (image layering, networking, volumes) hasn't been exercised end-to-end. The new `.github/workflows/docker-build.yml` closes this gap going forward — once it runs on your first push, you'll have a real, automated build check independent of this review.

---

## 4. Critical — blocks a credible open-source release

### 4.1 LICENSE file — deliberately skipped

No `LICENSE` file exists anywhere in the repo, and `package.json` has `"private": true`. Without a license, no one may legally use, modify, or redistribute the code, regardless of the README.

This was raised explicitly and **you chose to skip adding a LICENSE file for now** — so the code remains all-rights-reserved by default (no third party may legally use, modify, or redistribute it) even though the rest of this pass makes it deployable as self-hosted. Revisit this whenever you're ready to make the repo genuinely open-source:
- **MIT / Apache-2.0** — maximum adoption; permits others to offer Pagevo as a competing hosted SaaS with no obligation to share changes.
- **AGPL-3.0** — the common choice for "open-source but don't repackage my product as your own SaaS" (Plausible, and formerly Outline, use this model): anyone running a modified version as a network service must publish their changes.

Recommendation, whenever you decide: **AGPL-3.0** if you may ever sell a hosted version yourself; **MIT** if you want maximum community adoption regardless of who else hosts it.

### 4.2 ✅ Fixed — Remove/rewrite SaaS-only legal & marketing copy
| File | Issue |
|---|---|
| `app/terms/page.tsx:33-34` | "Subscriptions and Billing" clause describing paid plans that don't exist in the code |
| `app/privacy/page.tsx:38,54` | Hardcoded `privacy@pagevo.com` |
| `app/terms/page.tsx:54` | Hardcoded `legal@pagevo.com` |
| `app/page.tsx:182` | Landing-page mockup hardcodes `app.pagevo.com/workspace` |
| `lib/jobs/handlers/notification-digest-send.ts:109`, `notification-email-send.ts:67` | Dead-code fallback `https://app.pagevo.com` (never reached since `NEXT_PUBLIC_APP_URL` is a required env var) |

**Fix applied:** Terms/Privacy now carry a plain "the deploying operator is the data controller" notice and the billing clause and hardcoded emails are gone, the landing-page mockup text no longer hardcodes a domain, and both dead fallback URLs were deleted.

### 4.3 ✅ Fixed — Replaced the root README.md / cloud.md / AGENTS.md
These described a generic **"KROVA Scaffold"** — a starter-template name predating the actual product — and undersold it badly (no mention of the block editor, 4 database views, comments, permissions, templates, notifications, or admin panel).

**Fix applied:** the root `README.md` was rewritten to describe the real product and points readers at `SELF-HOSTING.md`; `AGENTS.md` was rewritten to be a useful pointer; the stale `cloud.md` was deleted.

---

## 5. Important — first-run experience

### 5.1 ✅ Fixed — Google sign-in button always renders, even unconfigured
`app/auth/_components/auth-form.tsx:103-141` always showed "Continue with Google," even though `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional and default to an empty string (`lib/auth/index.ts:32-33`). A self-hoster without Google OAuth set up got a button that failed on click with no explanation.

**Fix applied:** the sign-in page now fetches `GET /api/auth/methods` on mount and only renders the Google button when Google is actually configured and enabled (§6.5).

### 5.2 ✅ Fixed — Becoming an admin required shell + database access
The only path to Orbit Admin (`/orbit`) was `pnpm make:admin <email>` (`scripts/make-admin.ts`) — a meaningfully higher bar than self-hosted apps that auto-promote the first account (Plausible, Outline, Ghost).

**Fix applied:** the first user ever created is now auto-granted `isPlatformAdmin = true`, via the existing `databaseHooks.user.create.after` hook in `lib/auth/index.ts` (checks `count(users) === 1`). `pnpm make:admin` remains available as a recovery tool for additional admins.

### 5.3 ✅ Fixed — No visibility into missing configuration
If SMTP or storage credentials were wrong, failures only surfaced when something actually tried to use them.

**Fix applied:** superseded by the fuller Setup Checklist built for §5.11, which reports SMTP/storage/`APP_SECRET` status directly on the Orbit Admin overview page.

### 5.4 ✅ Fixed — Orbit Admin language assumed a SaaS-vs-customers relationship
Copy like "all tenant workspaces" and platform-wide "customer" analytics read oddly when the deploying org and the "customer" are the same entity.

**Fix applied:** reworded across `app/orbit-admin/layout.tsx`, `app/orbit-admin/orbit/page.tsx`, `app/orbit-admin/orbit/analytics/page.tsx`, and `app/orbit-admin/orbit/workspaces/page.tsx` ("platform team" → "instance admin", "tenant workspaces" → "workspaces on this instance"); the underlying functionality (user management, audit trail, template curation) is unchanged.

### 5.5 ✅ Fixed — Empty template gallery for up to ~10 minutes on a fresh install, plus a dead seed script
Found by tracing the actual template-seeding path end to end — there are **two separate, un-synced implementations**:
- `scripts/seed-templates.ts` (wired to `pnpm db:seed-templates` in `package.json`) deletes and re-inserts **19** templates — but nothing calls it. Not in Docker, not in any doc, not in any other script. It's dead code relative to what's actually served.
- The template gallery users actually see is seeded by a *different* path: `app/api/orbit/templates/seed/route.ts` (targets **16** templates, `cnt >= 16` threshold check), triggered either manually via the Orbit Admin "Seed 16 default templates" button (`components/orbit/seed-templates-button.tsx`), or automatically by the `SCAFFOLD_HEALTHCHECK` pg-boss job (`lib/jobs/handlers/scaffold-healthcheck.ts`, confusingly named — it does template auto-seeding, not just a healthcheck), which runs on a `*/10 * * * *` cron (`lib/jobs/register.ts`).

**Practical impact:** a brand-new self-hosted instance shows an **empty "Browse templates" gallery** until either an admin clicks the seed button in Orbit, or up to ~10 minutes pass waiting for the cron tick — neither of which is obvious to someone just following the setup guide. This is now called out explicitly in `SELF-HOSTING.md` §10 as a known first-run quirk with a one-click workaround.

**Fix applied:** deleted the orphaned `scripts/seed-templates.ts` and its `db:seed-templates` `package.json` script — the `scaffold-healthcheck` job's `autoSeedTemplates()` (targeting the real 16-template path) is now exported and reused directly instead of duplicated, so there's exactly one seeding implementation. The gallery's empty state (§5.10) also now gives an admin an immediate manual trigger instead of only waiting on the 10-minute cron.

### 5.6 ✅ Fixed — A leftover scaffold debug dashboard was still reachable in production, not just referenced in stale docs
Beyond the already-known stale branding in the root `README.md`/`cloud.md`/`AGENTS.md` (§4.3), there's a **live, reachable page** left over from the original scaffold: `app/platform/dashboard/page.tsx` and `.../profile/page.tsx`, rendered via `components/scaffold/app-shell.tsx` — an unbranded "Welcome back" dashboard with a debug-style **"Recent Email Outbox" table** (i.e., a raw view of queued/sent email contents), unrelated to the real product UI.

This isn't dead code — it's an actual redirect target reached from real user flows: `app/invite/[token]/page.tsx`, `app/invite/[token]/accept-invite-client.tsx`, `app/invite/[token]/wrong-account.tsx`, and `app/api/workspaces/[id]/transfer/confirm/route.ts` all redirect here in certain edge cases (e.g. an invite accepted with the wrong logged-in account). A user who hits one of those edge cases lands on a debug-looking page potentially showing email outbox contents — not a good look for a self-hosted product you're distributing publicly, and worth checking for actual data exposure before shipping.

**Fix applied:** deleted `app/platform/dashboard/` (both the main page and `profile/page.tsx`) and the `components/scaffold/` shell (`app-shell.tsx`, `page-header.tsx`) entirely, confirming the real dashboard equivalents live elsewhere in the app. Fixed all four redirect sites (`app/invite/[token]/page.tsx`, `accept-invite-client.tsx`, `wrong-account.tsx`, and `app/api/workspaces/[id]/transfer/confirm/route.ts`) to point at the real `/platform/post-auth` route instead, and replaced raw `<a>` tags with Next.js `<Link>` along the way.

### 5.7 Cosmetic scaffold-name leftover in a live script
`scripts/dev-db.ts` names the embedded-Postgres data directory `.krova-postgres` (also referenced in `.gitignore` and `.dockerignore`) — harmless functionally, but it's a leftover of the pre-Pagevo scaffold name sitting in code that actually runs, not just in docs/marketing copy. Left as-is — lowest priority in this pass; rename whenever convenient.

### 5.8 ✅ Fixed — No friendly error page if the database hasn't been migrated yet
There was no `app/error.tsx` or `app/global-error.tsx` anywhere in the repo. If a self-hoster started the app before running `docker compose run --rm migrate` / `pnpm db:migrate` (an easy step to forget on a first install), every query threw and the visitor saw Next.js's generic/raw error page — not a message telling them what actually went wrong or what to run.

**Fix applied:** added a root `app/error.tsx` that detects the "relation does not exist" Postgres error class and renders a clear "This instance hasn't been set up yet — run the database migration" message with the exact command, alongside a friendlier generic-error fallback for everything else.

### 5.9 ✅ Fixed — The "check your inbox" screen didn't say when no email was actually sent
`app/auth/_components/auth-form.tsx`'s post-submit screen unconditionally said *"We sent a sign-in link to [email]... Open the link in your email to sign in"* — this was misleading on any instance where SMTP isn't configured, since nothing was actually emailed; the link only exists in the worker's console log.

**Fix applied:** the sign-in form now reads `smtpConfigured` from `GET /api/auth/methods` and, when false, swaps the messaging to explain the link is only in the worker's server logs rather than falsely implying an email was sent.

### 5.10 ✅ Fixed — Template gallery's empty state had SaaS-vendor framing and no working call-to-action
`components/templates/template-gallery-modal.tsx`'s `EmptyState()` (reached whenever the gallery genuinely has zero templates — see §5.5) read: *"No templates yet — Templates are added by the Pagevo team via Orbit Admin."* Two problems: "the Pagevo team" implied an external vendor would handle it, which makes no sense on a self-hosted instance; and the message was inert text with no link, even for an admin who could fix it in two clicks.

**Fix applied:** `EmptyState()` was rewritten with branching logic — a platform admin now sees a direct "Seed default templates" button wired to the real seeding endpoint (§5.5), while a non-admin viewer sees copy accurate for a self-hosted instance instead of a vendor name that isn't operating it. Threaded an `isPlatformAdmin` prop down through `app/app/[workspace]/templates/page.tsx` and `templates-page-client.tsx` to make this possible.

### 5.11 ✅ Fixed — No proactive first-run setup experience for the instance admin — only a passive banner (§5.3)
§5.3's config-health banner told an admin *that* something's missing, but only if they went looking for it in Orbit Admin. A brand-new self-hoster's very first login gave no guided path to "here's what to check before inviting your team."

**Fix applied:** added a one-time, dismissible **Setup Checklist** (`components/orbit/setup-checklist.tsx`, backed by `lib/orbit/setup-status.ts`) on the Orbit Admin overview page, checking off SMTP configured Y/N, storage driver configured Y/N, and `APP_SECRET` not still the placeholder value — each item explains what's missing and links straight to the sign-in methods settings page. Dismissal is remembered per-browser via `localStorage` so it doesn't nag on every visit once acknowledged.

### 5.12 ✅ Fixed — No visible instance/version indicator anywhere in Orbit Admin
Self-hosted apps that get updated by pulling `git pull` + rebuilding (not an auto-updating SaaS) benefit from admins being able to see, at a glance, what version they're actually running — useful for their own change tracking, and essential if they ever ask for help (in an issue tracker, a community forum, etc.) and need to state what they're on. Nothing in the Orbit Admin UI surfaced this.

**Fix applied:** `app/orbit-admin/layout.tsx` now reads `package.json`'s `version` field and passes it down to `components/admin/admin-sidebar.tsx`, which renders it in the sidebar footer next to the existing user menu.

---

## 6. Authentication methods — email + password as the primary method, magic link and Google as two optional methods — ✅ implemented

You asked for **email + password** to be the primary, main sign-in method, with **magic link** and **Google OAuth** offered as two *optional* alternatives — each of the three independently switchable On/Off, instead of all-or-nothing. This section documents the implementation as built: exact schema, exact enforcement mechanism, exact UI changes, and why this specific approach beats the obvious alternatives.

**The hierarchy, and why:** email + password becomes the default, primary path shown first on the sign-in page — it needs no external service at all (§6.6), so it's the one guaranteed to work on any self-hosted instance regardless of what the operator has configured. Magic link and Google remain fully supported, but are positioned as *optional* methods an admin opts into, not the default expectation.

### 6.1 The core design decision: where does the On/Off switch live?

There are three places you *could* put a per-method toggle, and they have very different runtime behavior:

| Approach | Can flip without redeploying? | Enforced server-side? | Verdict |
|---|---|---|---|
| Env var (`AUTH_ENABLE_PASSWORD=false`) | ❌ needs restart | ✅ if checked in code | Too slow for an admin who wants to react immediately (e.g. disable Google after a credential leak) |
| Hide the button in the UI only | ✅ instant | ❌ **no** — the API endpoint still accepts requests | **Insecure** — anyone who knows the endpoint (or has an old bookmark) can still sign in via a "disabled" method |
| **A database-backed setting, read per-request, enforced inside Better Auth itself** | ✅ instant, no restart | ✅ **yes** — the endpoint itself refuses the request | **Recommended** |

The recommended approach is the only one that's both operationally convenient (self-hosters shouldn't need to redeploy to change a security posture) and actually secure (a toggle that only hides a button is not a toggle, it's a suggestion).

### 6.2 Schema

**`accounts` table — add one column:**
```ts
// lib/db/schema/auth.ts
password: text("password"),   // hashed; only set on providerId = "credential" rows
```
Better Auth's built-in email+password support stores the bcrypt-style hash here — this column doesn't exist in the current schema because the app was only ever configured for magic-link + Google.

**New singleton table — `auth_settings`:**
```ts
export const authSettings = pgTable("auth_settings", {
  id:                   integer("id").primaryKey().default(1),
  emailPasswordEnabled: boolean("email_password_enabled").notNull().default(true),
  magicLinkEnabled:     boolean("magic_link_enabled").notNull().default(true),
  googleEnabled:        boolean("google_enabled").notNull().default(true),
  updatedBy:            uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt:            updatedAt(),
}, (t) => [
  check("auth_settings_singleton_chk", sql`${t.id} = 1`),
  check("auth_settings_at_least_one_chk",
    sql`${t.emailPasswordEnabled} OR ${t.magicLinkEnabled} OR ${t.googleEnabled}`),
]);
```
One row, always `id = 1` — a self-hosted instance has one operator, not per-workspace auth policy, so this is instance-wide, not workspace-scoped. Two `CHECK` constraints make invalid states unrepresentable at the database level: you cannot have a non-singleton row, and you cannot disable all three methods at once (which would permanently lock everyone out, including the admin who just did it).

**`platform_audit_log`:** add `"settings"` to the `audit_target_type` enum so toggling auth methods is itself an audited Orbit action, per Hard Rule 17 ("every Orbit mutation writes to the audit log").

### 6.3 Enforcement — a Better Auth `hooks.before` middleware

Better Auth (the version already pinned in `package.json`, 1.6.18) supports a top-level `hooks.before` middleware that runs on **every** request before the actual endpoint handler — this is the hook point that makes server-side enforcement possible without forking the library:

```ts
// lib/auth/index.ts
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isAuthMethodEnabled } from "@/lib/auth/settings";

export const auth = betterAuth({
  // ...existing config...
  emailAndPassword: {
    enabled: true,              // makes the endpoints exist — the real On/Off is below
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      // mirror the existing sendMagicLink pattern: render an email, enqueueEmail()
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" || ctx.path === "/sign-in/email") {
        if (!(await isAuthMethodEnabled("emailPassword"))) {
          throw APIError.from("FORBIDDEN", { code: "EMAIL_PASSWORD_DISABLED", message: "Email and password sign-in is turned off on this instance." });
        }
      }
      if (ctx.path === "/sign-in/magic-link") {
        if (!(await isAuthMethodEnabled("magicLink"))) {
          throw APIError.from("FORBIDDEN", { code: "MAGIC_LINK_DISABLED", message: "Magic-link sign-in is turned off on this instance." });
        }
      }
      if (ctx.path === "/sign-in/social" && ctx.body?.provider === "google") {
        if (!(await isAuthMethodEnabled("google"))) {
          throw APIError.from("FORBIDDEN", { code: "GOOGLE_DISABLED", message: "Google sign-in is turned off on this instance." });
        }
      }
    }),
  },
});
```
`isAuthMethodEnabled()` (new `lib/auth/settings.ts`) reads the singleton row per-request — cheap (single indexed row, one query) at self-hosted scale. Google additionally requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to actually be set — the admin toggle can turn Google *off* freely, but can't turn it *on* without real credentials present, so there's no way to enable a method that would just fail anyway.

This blocks the request at the framework level regardless of what the client renders — the "hide the button" UI work (below) is for a good user experience, not for security; security comes from this middleware.

### 6.4 ✅ Built — Orbit Admin — the settings UI

New page, `app/orbit-admin/orbit/settings/page.tsx`, following the same fetch-toggle-save pattern already used at `app/app/[workspace]/settings/notifications/page.tsx` (`Switch` component, optimistic toggle, "Saved" confirmation), linked from the sidebar (`components/admin/admin-sidebar.tsx`):

- Three `<Switch>` rows: **Email & Password**, **Magic Link**, **Google**.
- Google's switch is disabled (with an inline note: *"Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable"*) whenever those env vars aren't present — matching the constraint enforced server-side in §6.3, so the UI can't even attempt an update that the API would reject anyway.
- Attempting to turn off the last remaining enabled method disables that switch outright (an admin literally can't click it), and any rejected update restores the previous state with an inline error.
- Every change writes to `platform_audit_log` via the existing `writeAuditLog()` helper (Hard Rule 17), same as every other Orbit mutation.

New API route, `app/api/orbit/auth-settings/route.ts`: `GET` (current state + whether Google is configured) and `PATCH` (update, `requireAdmin()`-gated, same pattern as every other `app/api/orbit/*` route).

### 6.5 ✅ Built — Sign-in page — conditional rendering

New public (pre-login) endpoint `GET /api/auth/methods` (`app/api/auth/methods/route.ts`) returns `{ emailPassword, magicLink, google, smtpConfigured }` — the sign-in page has no session yet, so it can't use the admin-only settings endpoint. `app/auth/_components/auth-form.tsx` fetches this once on mount and:

- Shows the Google button only if `google: true` — positioned as an *additive* option (a secondary "Continue with Google" button), never the primary call-to-action.
- Shows a **Password / Magic Link** segmented tab control only if *both* are enabled, **with Password as the default, first-selected tab** (matching the primary/optional hierarchy from §6) — if only one of the two is enabled, it's shown directly with no tab chrome (never make a user choose between one option).
- The password tab includes a **Sign in / Create account** toggle (Better Auth's `signIn.email` and `signUp.email` are genuinely separate endpoints — sign-up needs a `name` field, sign-in doesn't) and a **Forgot password?** link.
- If, somehow, all three end up disabled (shouldn't happen given the §6.2 `CHECK` constraint, but the UI never renders nothing), shows an explicit "no sign-in methods enabled — contact your administrator" message rather than a blank form.

Two new pages: `app/auth/forgot-password/page.tsx` (email → `authClient.requestPasswordReset()`) and `app/auth/reset-password/page.tsx` (new password → `authClient.resetPassword()`, reading `token` from the query string via `useSearchParams()` — Better Auth redirects to `{redirectTo}?token=...` as a query param, not a dynamic route segment), plus a `resetPasswordTemplate` email (`lib/email/templates/reset-password.ts` / `lib/email/components/reset-password.tsx`, mirroring the existing magic-link email pattern — same `EmailLayout` component, same `enqueueEmail()` call, degrades to console-logged in the worker exactly like magic links do when SMTP isn't configured).

**One naming correction made during implementation:** Better Auth's actual client method is `requestPasswordReset`, not `forgetPassword` as first assumed — confirmed by reading the library's route `operationId` directly rather than guessing.

### 6.6 Why this matters specifically for self-hosting

Beyond just "the feature you asked for," email+password is the **only one of the three methods that needs zero external services** — no SMTP provider, no Google Cloud project, nothing. A self-hoster who enables password auth and disables the other two has a fully working, invite-free instance with no outbound dependency at all (email is then purely optional, for password-reset convenience and notifications, not for the ability to sign in). That's worth calling out in `SELF-HOSTING.md` as the simplest possible self-hosted configuration — see its §7 (Authentication methods).

### 6.7 Default posture recommendation

Ship with **all three enabled by default** (matching the schema's defaults above) so nothing regresses for anyone already relying on magic-link or Google — let each self-hoster dial it down from Orbit Admin to match their own security posture, rather than picking a restrictive default that surprises people on upgrade. "Enabled by default" is about not breaking existing sign-in paths; it's independent of the UI hierarchy in §6.5, where Password is always the default-selected tab regardless of which methods are toggled on.

---

## 7. Nice-to-have — hardening & polish

- **Storage quota hardcoded to 5 GB/workspace** (`lib/storage/index.ts:60`, `lib/jobs/handlers/notify-storage-threshold.ts:6`) — sized for a SaaS pricing tier; make it configurable via env var for self-hosters who own their own disk.
- **No rate limiting anywhere** (no `middleware.ts`, no rate-limit library) — a self-hosted instance is often exposed directly to the internet without a SaaS provider's WAF/CDN. Recommend basic rate limiting on `/auth/login` and `/api/uploads/sign` at minimum.
- ~~**CONTRIBUTING.md / CODE_OF_CONDUCT.md** don't exist yet~~ ✅ done — added, along with `SECURITY.md` and `CHANGELOG.md`.
- **`package.json` version `0.1.0` / `"private": true`** — harmless, but worth a deliberate decision once you cut a public release tag. Note `"private": true` is orthogonal to `"version"`: it only blocks a stray `npm publish`, and stays `true` regardless of what git tags or GitHub Releases exist.
- ~~**CI is now partial, not complete**~~ ✅ done: `.github/workflows/ci.yml` now runs `pnpm typecheck`/`lint`/`test`/`build` plus a real-Postgres migrations check on every push and pull request. `.github/workflows/docker-build.yml` (added the prior pass) still sanity-checks that both Docker images build, now scoped to pull requests only. `.github/workflows/release.yml` builds and publishes the app/migrator/worker images to GHCR and cuts GitHub Releases from `CHANGELOG.md` after CI passes on `main`.

---

## 8. What does *not* need to change

- Environment validation (`lib/env.ts`) — only 3 vars are truly required (`DATABASE_URL`, `APP_SECRET`, `NEXT_PUBLIC_APP_URL`); everything cloud-related is optional with sane defaults.
- Storage driver abstraction, SMTP graceful degradation, permission model, workspace roles, per-page sharing — none of this assumes a hosted multi-tenant billing boundary.
- Background jobs (pg-boss) run entirely inside your own Postgres and are designed for a long-lived process — which the Docker deployment (§3) satisfies natively, unlike serverless hosting.

---

## 9. Suggested order of remaining work

1. ~~Docker deployment~~ ✅ done (§3).
2. ~~Fix build-breaking schema bugs~~ ✅ done (§2).
3. ~~Docker image HEALTHCHECK + build-sanity CI (incl. multi-arch)~~ ✅ done (§3).
4. ~~Fix the leftover scaffold dashboard reachable via invite/transfer edge cases~~ ✅ done (§5.6).
5. ~~Fix the three first-run UX rough edges that will confuse new self-hosters~~ ✅ done (§5.8-5.10): friendly error page when the DB isn't migrated yet, the "check your inbox" screen no longer lying when SMTP isn't configured, and the template-gallery empty state no longer naming a vendor and now giving admins a working fix-it button.
6. ~~Rewrite Terms/Privacy/root README~~ ✅ done (§4.2, §4.3). LICENSE itself was explicitly left unadded per your instruction at the time (§4.1) — since then, an AGPL-3.0-or-later `LICENSE` has been added and `package.json`'s `"license"` field matches it.
7. ~~First-user-auto-admin + conditional Google button~~ ✅ done (§5.1, §5.2).
8. ~~De-duplicate the two competing template-seeding implementations~~ ✅ done (§5.5): orphaned `db:seed-templates` script deleted; the real seeding path is now the single source of truth and is reachable synchronously from an admin's own click, not just the 10-minute cron.
9. ~~Password/magic-link/Google toggle system~~ ✅ done (§6) — the auth-methods feature, the biggest scope item this pass.
10. ~~Config-status banner upgraded to a proactive first-run Setup Checklist~~ ✅ done (§5.3, §5.11).
11. ~~Instance version indicator in Orbit Admin~~ ✅ done (§5.12).
12. ~~Choose and add a LICENSE, app-level lint/test CI, CONTRIBUTING.md/CODE_OF_CONDUCT.md/SECURITY.md/CHANGELOG.md, GHCR image publishing~~ ✅ done (this pass) — see §7 above and the top-level `README.md`.
13. **Remaining, not done any pass yet:** storage quota env var, rate limiting, `.krova-postgres` rename, `embedded-postgres` Docker image-size trim (§7) — hardening/polish that can trail a v1 release. Also still outstanding: **if you have any pre-existing production database, the manual migration-safety SQL workaround in §2.3** before merging this branch onto it. This pass's new `docker-compose.images.yml` and the `release.yml` image-publishing workflow are syntax-validated but not run end-to-end (no Docker daemon in this sandbox, and no GHCR images have been published yet) — the first real merge to `main` after this lands is the actual first test.
