# Pagevo — Development Plan

> **Project:** Pagevo — An opinionated team workspace for small teams (3–15 people).
> **Status:** Pre-development. Starter template is in place. Product features are not yet built.
> **Last Updated:** 2026-06-15

---

## AI Reading Protocol

> **Read this section first every time before implementing anything.**

This document is the single source of truth for building Pagevo. Follow these rules when using it:

1. **Implement phases in strict order.** Phase N depends on every phase before it. Never skip ahead.
2. **Before starting any phase:** read the `Spec ref` file listed at the top of that phase section. The spec has user stories, field-level data models, and business rules not repeated here.
3. **Never violate the 18 Hard Rules** in Section 6. They are architecture invariants that cannot be changed after data exists.
4. **Use `@/` for all imports** — never relative paths. `@/*` maps to the project root via `tsconfig.json`.
5. **Never read `process.env` directly** — always import from `@/lib/env` (Rule 9).
6. **Schema changes only via `pnpm db:generate`** — never hand-write SQL migration files (Rule 8).
7. **All page hierarchy mutations go through `lib/pages/closure.ts`** — never touch `parent_id` directly (Rule 4).
8. **All permission checks go through `lib/permissions/resolver.ts`** — never inline (Rule 3).
9. **Slow/IO/scheduled work = pg-boss job, never inline** in a Next.js route (Rule 2).
10. **Every phase ends with a verify step** — run it before moving to the next phase.

**Current active phase: PHASE 12 — Permissions & Sharing (in progress).**
Update this line to the current phase as you complete each one.

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [Tech Stack](#2-tech-stack)
3. [Current Codebase State](#3-current-codebase-state)
4. [Target Folder Structure](#4-target-folder-structure)
5. [Architecture Overview](#5-architecture-overview)
6. [18 Hard Rules](#6-18-hard-rules)
7. [Phase 0 — Pre-Development Fixes](#phase-0--pre-development-fixes)
8. [Phase 1 — Full Database Schema](#phase-1--full-database-schema)
9. [Phase 2 — Auth Cleanup](#phase-2--auth-cleanup)
10. [Phase 3 — Workspaces](#phase-3--workspaces)
11. [Phase 4 — Navigation & Sidebar](#phase-4--navigation--sidebar)
12. [Phase 5 — Pages](#phase-5--pages)
13. [Phase 6 — Block Editor](#phase-6--block-editor)
14. [Phase 7 — File Storage](#phase-7--file-storage)
15. [Phase 8 — Databases](#phase-8--databases)
16. [Phase 9 — Templates](#phase-9--templates)
17. [Phase 10 — Global Search](#phase-10--global-search)
18. [Phase 11 — Comments & Mentions](#phase-11--comments--mentions)
19. [Phase 12 — Permissions & Sharing](#phase-12--permissions--sharing)
20. [Phase 13 — Notifications](#phase-13--notifications)
21. [Phase 14 — Onboarding](#phase-14--onboarding)
22. [Phase 15 — Settings](#phase-15--settings)
23. [Phase 16 — Orbit Admin](#phase-16--orbit-admin)
24. [Phase 17 — Testing & CI/CD](#phase-17--testing--cicd)
25. [Timeline Summary](#timeline-summary)
26. [Post-MVP Roadmap](#post-mvp-roadmap)

---

## 1. What We Are Building

Pagevo is a structured team workspace — Notion's core, pre-assembled. It is built for **small teams (3–15 people)** who want a fast block editor, shared wiki, lightweight databases, and good search — ready to use on day one without any setup overhead.

**Content Model:**
```
Workspace
  └── Page
        ├── Blocks (paragraph, heading, image, code, todo, table, etc.)
        └── Subpages
              └── Database (kind = 'database')
                    └── Entry (kind = 'entry', is itself a Page)
                          └── Blocks + Subpages + nested Databases (recurses)
```

**Two processes, one database:**
```
┌─────────────────────┐     ┌──────────────────────┐
│   Next.js Server    │     │   pg-boss Worker      │
│  • Web UI           │     │  • Email delivery     │
│  • API routes       │     │  • Digest schedules   │
│  • Server actions   │     │  • Trash purge        │
│  • Auth + SSE       │     │  • File cleanup       │
│  • Enqueues jobs    │     │  • Export jobs        │
└────────┬────────────┘     └──────────┬────────────┘
         └──────────────┬──────────────┘
                ┌───────┴────────┐
                │   PostgreSQL   │
                │  + pg-boss     │
                └────────────────┘
```

**Spec docs location:** All feature specifications live in `doc/Features/*.md`.
**Schema reference:** `doc/DATABASE-PLAN.md`
**Architecture conventions:** `doc/CLAUDE.md`

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | `16.2.9` |
| Language | TypeScript strict | `^6.0.3` |
| Styling | Tailwind CSS v4 | `^4.3.0` |
| UI Primitives | Radix UI | `^1.5.0` |
| Icons | Phosphor Icons | `^2.1.10` |
| Editor | TipTap (ProseMirror) | to install |
| Math Rendering | KaTeX | to install |
| Database | PostgreSQL | `16+` |
| ORM | Drizzle ORM | `^0.45.2` |
| Auth | Better Auth (Magic Link + Admin) | `^1.6.17` |
| Job Queue | pg-boss | `^12.18.3` |
| Email | Nodemailer | `^8.0.11` |
| Storage | AWS SDK S3 | `^3.1067.0` |
| Forms | react-hook-form + Zod | `^7.78.0` / `^4.4.3` |
| State | Zustand | `^5.0.14` |
| Data Fetching | SWR | `^2.4.1` |
| Toasts | Sonner | `^2.0.7` |
| Real-time | Server-Sent Events (SSE) | built-in |
| Testing | Vitest + Playwright | to install |
| Package Manager | pnpm | `11.6.0` |

---

## 3. Current Codebase State

### ✅ Already Exists (Starter Template)

| File / Folder | What It Does |
|---------------|-------------|
| `app/layout.tsx` | Root layout — Toaster + TooltipProvider |
| `app/page.tsx` | Landing page (uses `components/landing-page.tsx`) |
| `app/(auth)/login/page.tsx` | Magic-link + **Google OAuth login** (OAuth must be removed) |
| `app/(auth)/layout.tsx` | Split-screen auth layout |
| `app/(app)/layout.tsx` | Protected layout — session guard |
| `app/(app)/dashboard/page.tsx` | Dashboard with **mock data** — needs real data later |
| `app/api/auth/[...all]/route.ts` | Better Auth catch-all handler |
| `app/globals.css` | Global Tailwind CSS |
| `middleware.ts` | Route protection — redirects unauthenticated to `/login` |
| `components/app-shell.tsx` | Sidebar + top bar shell — **static mock nav** |
| `components/landing-page.tsx` | Full landing page |
| `components/ui/` | 33 shadcn/ui components |
| `db/schema/auth.ts` | Auth tables only (`users`, `sessions`, `accounts`, `verifications`) |
| `db/schema/index.ts` | Schema barrel |
| `lib/auth.ts` | Better Auth config (has Google OAuth — remove it) |
| `lib/auth-client.ts` | Client-side auth hooks |
| `lib/db.ts` | Drizzle client |
| `lib/email.ts` | Nodemailer transporter |
| `lib/email/templates/magic-link.ts` | Magic-link email template |
| `lib/env.ts` | Zod-validated env vars |
| `lib/utils.ts` | `cn()` class merger |
| `lib/storage/s3-client.ts` | AWS S3 client init |
| `lib/storage/s3.ts` | S3 helpers (upload, download, delete, presign) |
| `lib/worker/boss.ts` | pg-boss init + start/stop |
| `lib/worker/job-types.ts` | Job name constants |
| `lib/worker/ensure-queues.ts` | Queue creation |
| `lib/worker/handlers/send-email.ts` | SEND_EMAIL handler |
| `scripts/worker.ts` | Worker process entry point |
| `drizzle.config.ts` | Drizzle config (points at `db/schema`) |
| `package.json` | All deps installed |
| `tsconfig.json` | Strict mode, `@/*` path alias |
| `.env.example` | Env var template |

### ❌ Not Yet Built (Everything Below Is New)

Everything from Phase 0 onward is new product code that does not exist yet.

---

## 4. Target Folder Structure

This is the full folder structure you are building toward. Every path below is the **final target location**.

```
pagevo/
│
├── app/
│   ├── layout.tsx                          # Root layout (keep as-is)
│   ├── page.tsx                            # Landing page (keep as-is)
│   ├── globals.css                         # Global styles (keep as-is)
│   │
│   ├── (auth)/
│   │   ├── layout.tsx                      # Auth layout (keep as-is)
│   │   └── login/
│   │       └── page.tsx                    # Magic-link only (remove Google OAuth)
│   │
│   ├── (app)/
│   │   ├── layout.tsx                      # Protected layout (keep, will evolve)
│   │   ├── onboarding/
│   │   │   └── page.tsx                    # NEW — Setup wizard (Phase 14)
│   │   └── [workspace]/
│   │       ├── layout.tsx                  # NEW — Workspace layout with sidebar (Phase 4)
│   │       ├── page.tsx                    # NEW — Workspace home (Phase 4)
│   │       ├── [pageId]/
│   │       │   └── page.tsx                # NEW — Page editor (Phase 5)
│   │       └── settings/
│   │           └── page.tsx                # NEW — Settings modal (Phase 15)
│   │
│   ├── orbit/                              # NEW — Admin panel (Phase 16)
│   │   ├── layout.tsx
│   │   ├── page.tsx                        # Dashboard
│   │   ├── users/page.tsx
│   │   ├── workspaces/page.tsx
│   │   ├── templates/page.tsx
│   │   └── audit/page.tsx
│   │
│   ├── invite/
│   │   └── [token]/
│   │       └── page.tsx                    # NEW — Accept workspace invite (Phase 3)
│   │
│   └── api/
│       ├── auth/[...all]/route.ts          # Keep as-is
│       ├── workspaces/
│       │   ├── route.ts                    # NEW — GET list, POST create (Phase 3)
│       │   └── [id]/
│       │       ├── route.ts                # NEW — GET, PATCH, DELETE (Phase 3)
│       │       ├── members/route.ts        # NEW — member management (Phase 3)
│       │       ├── members/[userId]/route.ts
│       │       ├── invite-link/route.ts
│       │       ├── transfer/route.ts
│       │       └── transfer/confirm/route.ts   # NEW — token validation + atomic handover (Phase 3)
│       ├── pages/
│       │   ├── route.ts                    # NEW — POST create (Phase 5)
│       │   └── [id]/
│       │       ├── route.ts                # NEW — GET, PATCH, DELETE (Phase 5)
│       │       ├── restore/route.ts
│       │       ├── move/route.ts
│       │       ├── duplicate/route.ts
│       │       ├── lock/route.ts
│       │       ├── versions/route.ts
│       │       ├── export/route.ts
│       │       ├── comments/route.ts       # NEW (Phase 11)
│       │       └── permissions/route.ts    # NEW (Phase 12)
│       ├── blocks/
│       │   └── batch/route.ts              # NEW — batch save blocks (Phase 6)
│       ├── databases/
│       │   └── [id]/
│       │       ├── views/route.ts          # NEW — list/create views (Phase 8)
│       │       ├── properties/route.ts     # NEW — list/create properties (Phase 8)
│       │       └── entries/route.ts        # NEW — list/create entries (Phase 8)
│       ├── templates/
│       │   ├── route.ts                    # NEW — list, create (Phase 9)
│       │   └── [id]/route.ts               # NEW — get, update, delete, use (Phase 9)
│       ├── files/
│       │   ├── presign/route.ts            # NEW — generate presigned URL (Phase 7)
│       │   └── confirm/route.ts            # NEW — confirm upload (Phase 7)
│       ├── search/route.ts                 # NEW — FTS search (Phase 10)
│       ├── comments/
│       │   └── [id]/
│       │       ├── route.ts                # NEW — edit, delete (Phase 11)
│       │       ├── resolve/route.ts        # NEW (Phase 11)
│       │       └── reopen/route.ts         # NEW (Phase 11)
│       ├── notifications/
│       │   ├── route.ts                    # NEW — list, mark read (Phase 13)
│       │   └── stream/route.ts             # NEW — SSE stream (Phase 13)
│       └── orbit/                          # NEW — Orbit Admin API (Phase 16, is_platform_admin only)
│           ├── users/route.ts              # NEW — list users, ban, unban, impersonate
│           ├── workspaces/route.ts         # NEW — list workspaces, delete
│           └── templates/route.ts          # NEW — built-in template CRUD
│
├── components/
│   ├── landing-page.tsx                    # Keep as-is
│   ├── app-shell.tsx                       # Will be replaced with workspace layout
│   ├── ui/                                 # Keep all 33 components as-is
│   │   └── *.tsx
│   ├── editor/                             # NEW — all TipTap editor components (Phase 6)
│   │   ├── editor.tsx                      # Main TipTap editor wrapper
│   │   ├── slash-menu.tsx                  # / command palette
│   │   ├── inline-toolbar.tsx              # Floating format toolbar
│   │   ├── block-registry.ts              # One entry per block type
│   │   └── blocks/                         # Individual block components
│   │       ├── paragraph.tsx
│   │       ├── heading.tsx
│   │       ├── todo.tsx
│   │       ├── image.tsx
│   │       ├── code-block.tsx
│   │       ├── equation.tsx
│   │       ├── columns.tsx
│   │       ├── linked-page.tsx
│   │       ├── inline-database.tsx
│   │       └── template-button.tsx
│   ├── database/                           # NEW — database view components (Phase 8)
│   │   ├── table-view.tsx
│   │   ├── board-view.tsx
│   │   ├── calendar-view.tsx
│   │   ├── gallery-view.tsx
│   │   ├── property-registry.ts           # One entry per property type
│   │   ├── filter-bar.tsx
│   │   ├── sort-bar.tsx
│   │   └── view-switcher.tsx
│   ├── sidebar/                            # NEW — sidebar components (Phase 4)
│   │   ├── sidebar.tsx
│   │   ├── page-tree.tsx
│   │   ├── workspace-switcher.tsx
│   │   ├── favorites-section.tsx
│   │   └── trash-section.tsx
│   ├── search/                             # NEW (Phase 10)
│   │   └── search-modal.tsx
│   ├── notifications/                      # NEW (Phase 13)
│   │   ├── notification-center.tsx
│   │   └── notification-bell.tsx
│   ├── templates/                          # NEW (Phase 9)
│   │   └── template-gallery.tsx
│   ├── pages/                              # NEW (Phase 12)
│   │   └── share-panel.tsx
│   ├── onboarding/                         # NEW (Phase 14)
│   │   └── onboarding-wizard.tsx
│   └── settings/                           # NEW (Phase 15)
│       └── settings-modal.tsx
│
├── lib/
│   ├── auth/                               # NEW — renamed from lib/auth.ts (Phase 2)
│   │   ├── index.ts                        # Better Auth config (magic-link only)
│   │   └── client.ts                       # Moved from lib/auth-client.ts
│   ├── db/                                 # NEW — reorganized from lib/db.ts (Phase 0)
│   │   ├── index.ts                        # Drizzle client
│   │   ├── schema/                         # NEW — split schema files (Phase 1)
│   │   │   ├── types.ts                    # Enums + updatedAt() + tsvector
│   │   │   ├── auth.ts                     # users, sessions, accounts, verifications
│   │   │   ├── workspace.ts               # workspaces, workspace_members, slug_redirects
│   │   │   ├── pages.ts                    # pages, page_closure, page_versions, blocks
│   │   │   ├── databases.ts               # database_views, database_properties, property_values
│   │   │   ├── sharing.ts                  # page_permissions, public_links, guest_invitations
│   │   │   ├── collaboration.ts           # comments, notifications, notification_preferences, email_outbox
│   │   │   ├── search.ts                   # search_index
│   │   │   ├── templates.ts               # templates
│   │   │   ├── files.ts                    # file_uploads, workspace_storage_usage
│   │   │   ├── user-state.ts              # user_preferences, user_hint_states, user_favorites, user_recently_visited
│   │   │   ├── platform.ts                # platform_audit_log
│   │   │   └── index.ts                    # Barrel re-export of all above
│   │   └── queries/                        # NEW — reusable query helpers (built per phase)
│   ├── jobs/                               # NEW — renamed from lib/worker/ (Phase 0)
│   │   ├── boss.ts                         # pg-boss init (moved from lib/worker/boss.ts)
│   │   ├── job-names.ts                    # JOB_NAMES const — single source of truth
│   │   ├── queue-options.ts               # QUEUE_OPTIONS per job
│   │   ├── register.ts                     # ALL boss.work() calls — only here
│   │   └── handlers/                       # One file per job handler
│   │       ├── send-email.ts               # Moved from lib/worker/handlers/
│   │       ├── send-workspace-invite.ts    # NEW (Phase 3)
│   │       ├── send-notification-email.ts  # NEW (Phase 13)
│   │       ├── send-email-digest.ts        # NEW (Phase 13)
│   │       ├── cleanup-notifications.ts    # NEW (Phase 13)
│   │       ├── cleanup-stale-uploads.ts    # NEW (Phase 7)
│   │       ├── cleanup-orphaned-media.ts   # NEW (Phase 7)
│   │       ├── sync-storage-usage.ts       # NEW (Phase 7)
│   │       ├── auto-delete-expired-trash.ts # NEW (Phase 5)
│   │       ├── warn-expiring-trash.ts      # NEW (Phase 13)
│   │       ├── auto-delete-expired-versions.ts # NEW (Phase 5)
│   │       └── export-page.ts              # NEW (Phase 5)
│   ├── pages/
│   │   └── closure.ts                      # NEW — insertPageWithClosure, movePageWithClosure, deletePageClosure (Phase 4)
│   ├── permissions/
│   │   └── resolver.ts                     # NEW — requireSession, requireWorkspaceMember, requirePagePermission (Phase 12)
│   ├── notifications/
│   │   └── triggers.ts                     # NEW — notification trigger functions (Phase 13)
│   ├── email.ts                            # Keep as-is (Nodemailer transporter)
│   ├── email/
│   │   └── templates/
│   │       ├── magic-link.ts               # Keep as-is
│   │       ├── workspace-invite.ts         # NEW (Phase 3)
│   │       ├── guest-invite.ts             # NEW (Phase 12)
│   │       ├── mention.ts                  # NEW (Phase 13)
│   │       ├── comment-reply.ts            # NEW (Phase 13)
│   │       ├── digest.ts                   # NEW (Phase 13)
│   │       └── trash-warning.ts            # NEW (Phase 13)
│   ├── storage/
│   │   ├── s3-client.ts                    # Keep as-is
│   │   └── s3.ts                           # Keep as-is
│   ├── utils.ts                            # Keep as-is
│   └── env.ts                              # Keep as-is (add new vars per phase)
│
├── scripts/
│   └── worker.ts                           # Update imports to lib/jobs/ (Phase 0)
│
├── doc/                                    # All spec docs (already complete)
│   ├── README.md
│   ├── DATABASE-PLAN.md
│   ├── CLAUDE.md
│   ├── GETTING-STARTED.md
│   ├── Features/
│   │   ├── development-plan.md
│   │   ├── authentication.md
│   │   ├── workspace.md
│   │   ├── navigation.md
│   │   ├── pages.md
│   │   ├── editor.md
│   │   ├── file-storage.md
│   │   ├── databases.md
│   │   ├── database-properties.md
│   │   ├── templates.md
│   │   ├── search.md
│   │   ├── comments.md
│   │   ├── permissions.md
│   │   ├── notifications.md
│   │   ├── onboarding.md
│   │   ├── settings.md
│   │   └── admin-panel.md
│   └── docs/
│       ├── security.md
│       ├── ui-design.md
│       └── architecture/
│
├── .github/
│   └── workflows/
│       └── ci.yml                          # NEW — lint + typecheck + test on push (Phase 17)
├── drizzle/                                # Auto-generated migration files
├── drizzle.config.ts                       # Update schema path (Phase 0)
├── middleware.ts                           # Keep as-is
├── next.config.ts                          # Keep as-is
├── tsconfig.json                           # Keep as-is
├── package.json                            # Add TipTap, KaTeX, Vitest, Playwright
├── DEVELOPMENT-PLAN.md                     # This file
└── .env.example                            # Update as new vars are added
```

---

## 5. Architecture Overview

### Permission Resolution (Single Recursive CTE)
```sql
-- Walk parent_id up to find the first explicit page_permissions row,
-- then fall back to workspaces.default_page_access.
-- is_private = true short-circuits: only creator + explicit grants apply.
-- Filter restricted rows in SQL — never after fetch (BOLA risk).
```

### Closure Table (Page Hierarchy)
```sql
-- page_closure: one row per (ancestor, descendant), including self at depth 0.
-- "Get all descendants" = one query. Used for permissions, search scoping, bulk ops.
-- Maintained in the SAME transaction as any parent_id change.
-- All parent_id mutations go through lib/pages/closure.ts ONLY.
```

### Block Storage (JSONB + schema_version)
```sql
-- blocks.content = jsonb (flexible block shapes)
-- blocks.schema_version = integer (start at 1, bump on shape changes)
-- FTS triggers maintain search_index automatically on blocks/property_values/comments changes.
```

### Background Jobs (pg-boss)
```
All slow / retryable / scheduled work → pg-boss job → lib/jobs/handlers/*.ts
Never inline in a Next.js request handler.
Only exception: SSE notification stream.
```

---

## 6. 18 Hard Rules

> These are architecture decisions that are **impossible to change after data exists**. Follow from the first commit.

| # | Rule |
|---|------|
| 1 | **Keep docs current.** When you add a feature / change schema / add a rule → update `doc/CLAUDE.md` and the relevant `doc/Features/*.md` spec. |
| 2 | **Never do slow/IO/scheduled work inline in a Next.js route.** Enqueue a pg-boss job. Only exception: SSE stream. |
| 3 | **Always resolve permissions through `lib/permissions/resolver.ts` at the SQL level.** Never filter restricted rows in JS after fetch — that is a BOLA vulnerability. |
| 4 | **All `parent_id` mutations go through `lib/pages/closure.ts`.** Never update `parent_id` directly. Closure corruption silently breaks the whole page hierarchy and all permission checks. |
| 5 | **Block content is JSONB with `schema_version: 1` from day one.** Never change a block shape without bumping version and writing a migration. |
| 6 | **Search index is maintained by PostgreSQL triggers** on `blocks`, `property_values`, `comments`. No separate reindex job. Bulk writes must batch to avoid per-row trigger storms. |
| 7 | **No raw SQL** except: FTS triggers, closure-table SQL, DDL, or ops Drizzle can't express. Use Drizzle everywhere else. |
| 8 | **Schema changes only via `pnpm db:generate`.** Never hand-write migration files. Edit `lib/db/schema/*.ts` → generate → review SQL → migrate. |
| 9 | **All env vars through `lib/env.ts` Zod only.** Never read `process.env` directly elsewhere. |
| 10 | **All job handlers must be idempotent.** pg-boss is at-least-once. Cron jobs use `policy: "exclusive"`. |
| 11 | **Notifications are transactional.** Enqueue the notification job inside the **same transaction** as the triggering event. Never notify a user of their own action. |
| 12 | **Extend registries, never scatter switch statements.** Block Registry, Property Registry, Notification Registry, Job Registry — add a type by adding ONE registry entry only. |
| 13 | **File uploads use pre-signed direct-to-S3 PUT URLs.** Validate type + per-type size limit server-side before issuing URL. Never proxy file bytes through the app server. |
| 14 | **The Title property is virtual.** Lives in `pages.title`. Never written to `property_values`. Always column 1, never deletable, never reorderable, not in 50-property limit. |
| 15 | **Soft delete only** — `is_deleted + deleted_at` for pages (30-day Trash). Hard deletion only via `auto-delete-expired-trash` job. |
| 16 | **Magic-link tokens are single-use.** Better Auth handles invalidation. Never rename auth schema columns after the first deployment — it forces a data migration. |
| 17 | **Every Orbit Admin mutation writes to `platform_audit_log`.** Append-only. Actor, action, target, metadata. |
| 18 | **All forms validate with Zod.** Show validation errors inline — never via toast. Disable submit until form is valid and dirty (for edit forms). |

---

## Phase 0 — Pre-Development Fixes

**Duration:** 2–3 days
**Goal:** Align the starter template with the Pagevo architecture before writing any product code.
**Spec ref:** `doc/CLAUDE.md`

### Checklist

- [ ] **Remove Google OAuth from `lib/auth.ts`** — remove the `google` provider. Pagevo is magic-link only (passwordless). No passwords, no social login.
- [ ] **Update `app/(auth)/login/page.tsx`** — remove the Google sign-in button. Keep only the magic-link email form.
- [ ] **Create `lib/db/` directory** — this is the new home for all database code.
- [ ] **Create `lib/db/schema/` directory** — split schema goes here (built in Phase 1).
- [ ] **Create `lib/db/index.ts`** — move Drizzle client from `lib/db.ts` here:
  ```ts
  import { drizzle } from "drizzle-orm/postgres-js";
  import postgres from "postgres";
  import * as schema from "./schema";
  import { env } from "@/lib/env";   // Rule 9 — never use process.env directly
  const client = postgres(env.DATABASE_URL, { prepare: false });
  export const db = drizzle(client, { schema, casing: "snake_case" });
  ```
- [ ] **Delete `lib/db.ts`** — replaced by `lib/db/index.ts`.
- [ ] **Create `lib/jobs/` directory** — rename from `lib/worker/`.
- [ ] **Move `lib/worker/boss.ts` → `lib/jobs/boss.ts`**.
- [ ] **Create `lib/jobs/job-names.ts`** — `JOB_NAMES` const object (single source of truth for all queue name strings).
- [ ] **Create `lib/jobs/queue-options.ts`** — `QUEUE_OPTIONS` record keyed by `JobName`.
- [ ] **Create `lib/jobs/register.ts`** — all `boss.work()` calls live here and only here.
- [ ] **Move `lib/worker/handlers/send-email.ts` → `lib/jobs/handlers/send-email.ts`**.
- [ ] **Delete `lib/worker/`** directory entirely.
- [ ] **Update `scripts/worker.ts`** — fix all imports to point at `lib/jobs/`.
- [ ] **Update `drizzle.config.ts`** — change schema path:
  ```ts
  schema: "./lib/db/schema",   // was "./db/schema/index.ts"
  out: "./drizzle",
  ```
- [ ] **Create `lib/permissions/resolver.ts`** — stub file with exported function signatures (full implementation in Phase 12).
- [ ] **Create `lib/pages/closure.ts`** — stub file with exported function signatures (full implementation in Phase 4).
- [ ] **Update all imports** across the project — `lib/db.ts` → `lib/db`, `lib/auth.ts` → `lib/auth`, `lib/worker/` → `lib/jobs/`.
- [ ] **Update `package.json` name** — change `"name": "saas-starter"` to `"name": "pagevo"`.

### Verify Before Moving to Phase 1
```bash
pnpm typecheck   # must pass with zero errors
pnpm dev         # app must start — login page shows magic-link form only (no Google button)
```

---

## Phase 1 — Full Database Schema

**Duration:** 1 week
**Goal:** All 30+ tables exist in PostgreSQL. Every subsequent phase builds on top of this.
**Spec ref:** `doc/DATABASE-PLAN.md` (read this file completely before starting)

### Schema Files to Create

Each file lives in `lib/db/schema/`. The full field-by-field definitions are in `doc/DATABASE-PLAN.md`.

---

#### `lib/db/schema/types.ts`
Shared by every domain file. Contains:
- `tsvector` custom type (for PostgreSQL full-text search)
- `updatedAt()` helper function — **every `updated_at` column must use this, not `defaultNow()` alone**
- All `pgEnum` declarations:

| Enum | Values |
|------|--------|
| `workspaceRole` | `admin`, `editor`, `viewer` |
| `memberStatus` | `active`, `invited`, `expired` |
| `defaultPageAccess` | `private`, `shared` |
| `pageKind` | `page`, `database`, `entry` |
| `fontFamily` | `default`, `serif`, `mono` |
| `blockType` | `paragraph`, `h1`, `h2`, `h3`, `bullet`, `numbered`, `toggle`, `quote`, `callout`, `divider`, `todo`, `image`, `video`, `audio`, `file`, `toc`, `table`, `columns`, `code`, `equation`, `linked_page`, `database`, `template_button` |
| `viewType` | `table`, `board`, `calendar`, `gallery` |
| `galleryCardSize` | `small`, `medium`, `large` |
| `entryOpenMode` | `side_panel`, `full_page` |
| `propertyType` | `text`, `number`, `select`, `multi_select`, `date`, `checkbox`, `url`, `email`, `phone`, `person`, `relation` |
| `accessLevel` | `full_access`, `can_edit`, `can_comment`, `can_view` |
| `publicAccessLevel` | `can_view`, `can_comment` |
| `guestAccessLevel` | `can_view`, `can_comment`, `can_edit` |
| `notificationType` | `mention`, `comment`, `reply`, `resolved`, `reopened`, `access_granted`, `workspace_invite`, `guest_accepted`, `trash_warning` |
| `emailFrequency` | `realtime`, `daily`, `weekly`, `off` |
| `emailOutboxStatus` | `queued`, `sending`, `sent`, `failed` |
| `emailOutboxType` | `notification_email`, `digest_email` |
| `templateCategory` | `personal`, `productivity`, `project_mgmt`, `team`, `crm` |
| `templateStatus` | `draft`, `published` |
| `searchSourceType` | `page`, `entry`, `comment` |
| `auditTargetType` | `user`, `workspace` |
| `fileUploadKind` | `page_cover`, `page_icon`, `block_media`, `user_avatar`, `workspace_icon` |

---

#### `lib/db/schema/auth.ts`
Tables: `users`, `sessions`, `accounts`, `verifications`

Key fields to add to `users` (beyond what the current starter has):
- `job_title` — from onboarding profile step
- `timezone` — IANA timezone for digest delivery
- `is_platform_admin` — boolean, default false, Orbit Admin access
- `onboarding_completed` — boolean, default false
- `onboarding_step` — integer 0–4
- `tour_completed` — boolean, default false
- `last_active_at` — timestamp

Key fields to add to `sessions`:
- `impersonated_by` — uuid FK → users.id (for Orbit Admin impersonation)

---

#### `lib/db/schema/workspace.ts`
Tables: `workspaces`, `workspace_members`, `workspace_slug_redirects`

---

#### `lib/db/schema/pages.ts`
Tables: `pages`, `page_closure`, `page_versions`, `blocks`

Key notes:
- `pages.kind` discriminates between `page`, `database`, `entry`
- `pages.database_id` — FK to `pages.id` (when kind = 'entry')
- `pages.default_view_id` — FK to `database_views.id` (circular — deferred FK in migration)
- `pages.order_index` — sibling order for drag-and-drop
- `blocks.content` — jsonb, never null
- `blocks.schema_version` — integer, starts at 1

---

#### `lib/db/schema/databases.ts`
Tables: `database_views`, `database_properties`, `property_values`

---

#### `lib/db/schema/sharing.ts`
Tables: `page_permissions`, `public_links`, `guest_invitations`

---

#### `lib/db/schema/collaboration.ts`
Tables: `comments`, `notifications`, `notification_preferences`, `email_outbox`

---

#### `lib/db/schema/search.ts`
Tables: `search_index`

---

#### `lib/db/schema/templates.ts`
Tables: `templates`

---

#### `lib/db/schema/files.ts`
Tables: `file_uploads`, `workspace_storage_usage`

---

#### `lib/db/schema/user-state.ts`
Tables: `user_preferences`, `user_hint_states`, `user_favorites`, `user_recently_visited`

---

#### `lib/db/schema/platform.ts`
Tables: `platform_audit_log`

---

#### `lib/db/schema/index.ts`
```ts
export * from "./types";
export * from "./auth";
export * from "./workspace";
export * from "./pages";
export * from "./databases";
export * from "./sharing";
export * from "./collaboration";
export * from "./search";
export * from "./templates";
export * from "./files";
export * from "./user-state";
export * from "./platform";
```

### Inferred Types

Export from each domain file:
```ts
export type User             = typeof users.$inferSelect;
export type NewUser          = typeof users.$inferInsert;
export type Workspace        = typeof workspaces.$inferSelect;
export type WorkspaceMember  = typeof workspaceMembers.$inferSelect;
export type Page             = typeof pages.$inferSelect;
export type NewPage          = typeof pages.$inferInsert;
export type Block            = typeof blocks.$inferSelect;
// ... one pair per table
```

### Migration Steps

```bash
# 1. Write all schema files
# 2. Run generation
pnpm db:generate

# 3. Open the generated SQL file in drizzle/
# 4. Manually append these 3 SQL blocks at the end:

# BLOCK 1 — Deferred FK (circular reference pages ↔ database_views)
ALTER TABLE pages
  ADD CONSTRAINT pages_default_view_fk
  FOREIGN KEY (default_view_id) REFERENCES database_views(id) ON DELETE SET NULL;

# BLOCK 2 — FTS trigger functions (pagevo_search_upsert, pagevo_entry_search_upsert, pagevo_comment_search_upsert)
# See doc/DATABASE-PLAN.md for the full SQL — copy verbatim

# BLOCK 3 — Closure table reference SQL comments
# See doc/DATABASE-PLAN.md for the INSERT/MOVE/DELETE patterns

# 5. Apply migration
pnpm db:migrate

# 6. Verify
pnpm db:studio    # All tables should be visible
```

### Verify Before Moving to Phase 2
```bash
pnpm db:studio    # All 30+ tables visible with correct columns
pnpm db:migrate   # No pending migrations
pnpm typecheck    # Zero errors
```

---

## Phase 2 — Auth Cleanup

**Duration:** 3 days
**Prerequisite:** Phase 0 complete (Google OAuth already removed from login page in Phase 0; this phase moves and properly configures the auth module).
**Goal:** Auth module restructured, magic-link properly mapped to new schema, impersonation TTL guard in place.
**Spec ref:** `doc/Features/authentication.md`

### Tasks

- [ ] **Restructure auth config** — move `lib/auth.ts` → `lib/auth/index.ts`, move `lib/auth-client.ts` → `lib/auth/client.ts`
- [ ] **Confirm Google OAuth is absent** from `lib/auth/index.ts` (was removed in Phase 0 — verify it is not there)
- [ ] **Wire Better Auth adapter** to new schema with explicit table mapping:
  - `user` → `users`, `session` → `sessions`, `account` → `accounts`, `verification` → `verifications`
  - Set `usePlural: true` and `casing: "snake_case"`
  - Map `bannedReason` → `banned_reason` field override
- [ ] **Add impersonation TTL guard** in `lib/auth/index.ts` — `beforeRefresh` hook that rejects any refresh where `NOW() - session.impersonated_at > 2 hours`
- [ ] **Update `app/api/auth/[...all]/route.ts`** — point to new `lib/auth/index.ts`
- [ ] **Update `middleware.ts`** — verify still works after auth refactor
- [ ] **Update all `lib/auth-client` imports** across the project → `lib/auth/client`
- [ ] **Test magic-link flow end to end:** email input → magic-link email received → click link → session created → redirected to app

### Auth Endpoints (Already Handled by Better Auth)
| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/sign-in/magic-link` | Request magic link (same response whether email exists or not) |
| `GET /api/auth/verify-magic-link` | Consume token → create session → redirect |
| `POST /api/auth/sign-out` | Destroy current session |
| `GET /api/auth/session` | Return current session data |

### Verify Before Moving to Phase 3
```bash
pnpm typecheck          # zero errors
# Manual test:
# 1. POST /api/auth/sign-in/magic-link → check email arrives
# 2. Click link → session created, redirected to /dashboard
# 3. Confirm no Google OAuth button exists on /login
```

---

## Phase 3 — Workspaces

**Duration:** 1 week
**Prerequisite:** Phase 1 (schema) + Phase 2 (auth) complete.
**Goal:** Users can create a workspace, invite members, switch between workspaces.
**Spec ref:** `doc/Features/workspace.md`

### Files to Create

| File | Purpose |
|------|---------|
| `app/api/workspaces/route.ts` | GET list, POST create |
| `app/api/workspaces/[id]/route.ts` | GET, PATCH, DELETE |
| `app/api/workspaces/[id]/members/route.ts` | GET members, POST invite by email |
| `app/api/workspaces/[id]/members/[userId]/route.ts` | PATCH role, DELETE remove |
| `app/api/workspaces/[id]/invite-link/route.ts` | POST generate, DELETE disable |
| `app/api/workspaces/[id]/transfer/route.ts` | POST initiate ownership transfer (sends email confirmation) |
| `app/api/workspaces/[id]/transfer/confirm/route.ts` | GET validate token + complete transfer atomically |
| `app/invite/[token]/page.tsx` | Accept workspace invite page |
| `components/sidebar/workspace-switcher.tsx` | Dropdown of user's workspaces |
| `lib/email/templates/workspace-invite.ts` | Invite email template |
| `lib/jobs/handlers/send-workspace-invite.ts` | pg-boss handler for invite email |

### Business Rules to Enforce in Code

- **`workspace_storage_usage` row (`bytes_used = 0`) MUST be inserted in the same transaction as workspace creation** — the first file upload quota check will crash without it
- Exactly one Admin per workspace at all times
- Admin role cannot be changed via role dropdown — only via Transfer Ownership
- Removing a member → regenerate `invite_link_token` in the same transaction as the delete
- Slug change → INSERT `workspace_slug_redirects` row BEFORE updating `workspaces.slug` in same transaction
- Invite emails expire after 7 days

### Roles
| Role | Can Do |
|------|--------|
| Admin | All workspace settings, all members, all non-private pages |
| Editor | Create and edit pages, subject to page-level restrictions |
| Viewer | Read-only, only pages explicitly shared with them |

### Verify Before Moving to Phase 4
```bash
pnpm typecheck
# Manual test:
# 1. Sign in → complete onboarding → workspace created
# 2. workspace_storage_usage row exists for new workspace (check db:studio)
# 3. Invite a second user by email → email arrives → user accepts → member appears
# 4. Switch workspace from workspace-switcher
```

---

## Phase 4 — Navigation & Sidebar

**Duration:** 1 week
**Prerequisite:** Phase 3 (workspaces) complete.
**Goal:** Sidebar shows a real, live page hierarchy for the current workspace.
**Spec ref:** `doc/Features/navigation.md`

### Files to Create

| File | Purpose |
|------|---------|
| `lib/pages/closure.ts` | **Critical** — all page hierarchy mutations go here |
| `app/(app)/[workspace]/layout.tsx` | Workspace layout wrapping the sidebar |
| `app/(app)/[workspace]/page.tsx` | Workspace home (page tree root) |
| `app/api/workspaces/[id]/pages/route.ts` | GET flat page list for sidebar (id, title, icon, parentId, orderIndex, kind) |
| `components/sidebar/sidebar.tsx` | Main sidebar container |
| `components/sidebar/page-tree.tsx` | Recursive page tree |
| `components/sidebar/favorites-section.tsx` | Starred pages section |
| `components/sidebar/trash-section.tsx` | Deleted pages section |

### `lib/pages/closure.ts` — The Most Critical File

```ts
// This module is the ONLY place that touches page_closure.
// Every parent_id mutation must go through these functions.

export async function insertPageWithClosure(tx, pageId: string, parentId: string | null): Promise<void>
// INSERT page_closure: self row at depth 0 + all ancestor rows from parent

export async function movePageWithClosure(tx, pageId: string, newParentId: string | null): Promise<void>
// Step 1: Remove old ancestor paths (keep descendants' self rows)
// Step 2: Re-insert paths through new parent for page + all its descendants
// Both steps in one transaction

export async function deletePageClosure(tx, pageId: string): Promise<void>
// ON DELETE CASCADE on FK handles this — but call here for explicit tracking
```

### Sidebar Features
- [ ] Collapsible sidebar — save state to `user_preferences.sidebar_collapsed`
- [ ] Resizable width (200–480px) — save to `user_preferences.sidebar_width`
- [ ] Workspace switcher at top
- [ ] Page tree — hierarchical, expand/collapse nodes, ordered by `order_index`
- [ ] Drag-and-drop reorder — on drop: call `movePageWithClosure()` + update `order_index`
- [ ] Favorites section — pages in `user_favorites` for current user+workspace
- [ ] Recently Visited section — last 10 from `user_recently_visited` (upsert on page open)
- [ ] Trash section — pages where `is_deleted = true`
- [ ] Sidebar filter — live name filter on the page tree

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/workspaces/:id/pages` | Flat list for sidebar (id, title, icon, parentId, orderIndex, kind) |
| PATCH | `/api/pages/:id/move` | Move page to new parent (calls `movePageWithClosure`) |

### Verify Before Moving to Phase 5
```bash
pnpm typecheck
# Manual test:
# 1. Sidebar loads and shows page tree for current workspace
# 2. Drag-and-drop a page to a new parent → page_closure table updates correctly (check db:studio)
# 3. Sidebar collapses/expands, width is resizable and persists on reload
```

---

## Phase 5 — Pages

**Duration:** 1 week
**Prerequisite:** Phase 4 (sidebar) complete.
**Goal:** Pages can be created, opened, edited, moved, duplicated, deleted, and restored.
**Spec ref:** `doc/Features/pages.md`

### Files to Create

| File | Purpose |
|------|---------|
| `app/api/pages/route.ts` | POST create |
| `app/api/pages/[id]/route.ts` | GET, PATCH, DELETE |
| `app/api/pages/[id]/restore/route.ts` | POST restore from trash |
| `app/api/pages/[id]/move/route.ts` | POST move to new parent |
| `app/api/pages/[id]/duplicate/route.ts` | POST duplicate |
| `app/api/pages/[id]/lock/route.ts` | POST toggle lock |
| `app/api/pages/[id]/versions/route.ts` | GET version history |
| `app/api/pages/[id]/export/route.ts` | POST queue export job |
| `app/(app)/[workspace]/[pageId]/page.tsx` | Main page view + editor route |
| `lib/jobs/handlers/auto-delete-expired-trash.ts` | Daily — purge 30-day old trash |
| `lib/jobs/handlers/warn-expiring-trash.ts` | Daily — warn owners near deletion |
| `lib/jobs/handlers/auto-delete-expired-versions.ts` | Daily — prune old versions |
| `lib/jobs/handlers/export-page.ts` | On demand — MD / HTML / PDF |

### Page Features to Build
- [ ] Page header — editable inline title (never empty, default "Untitled")
- [ ] Emoji icon picker (click icon to change) + image icon (S3 upload)
- [ ] Cover banner image — upload, position slider (saved as `cover_position` 0.0–1.0)
- [ ] Breadcrumbs — workspace → parents → current page
- [ ] Layout options: full-width toggle, small text toggle, font family dropdown
- [ ] Page actions menu (⋯): Move, Duplicate, Delete, Lock/Unlock, Copy Link, Export, Add to Favorites
- [ ] Soft delete → moves to Trash (`is_deleted = true`, `deleted_at = now()`)
- [ ] Restore from Trash → clears `is_deleted` and `deleted_at`
- [ ] Duplicate — copies blocks, subpages, icon, cover. Does NOT copy permissions or comments
- [ ] Page lock (`is_locked = true`) — read-only for all; only Full Access role can toggle
- [ ] Version history panel — list versions, click to preview snapshot
- [ ] Auto-snapshot: one `page_versions` row per 10-minute window per user while editing

### Page Business Rules
- Title default: `"Untitled"` — never null, never empty string
- Delete → subpages cascade to Trash with the parent (set `is_deleted = true` on all descendants)
- Duplicate copies `is_private` from source — workspace default is NOT applied to duplicates
- Move → inherits new parent's permissions unless page already has custom permissions

### Verify Before Moving to Phase 6
```bash
pnpm typecheck
# Manual test:
# 1. Create a page → title defaults to "Untitled"
# 2. Delete a page → appears in Trash → restore it → page reappears
# 3. Duplicate a page → new page has same icon/cover, no comments
# 4. Lock a page → editor is read-only
```

---

## Phase 6 — Block Editor

**Duration:** 3 weeks
**Prerequisite:** Phase 5 (pages) complete.
**Goal:** TipTap-powered block editor saving real blocks to the database with auto-save.
**Spec ref:** `doc/Features/editor.md`

### New Packages to Install

```bash
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit
pnpm add @tiptap/extension-placeholder @tiptap/extension-character-count
pnpm add @tiptap/extension-image @tiptap/extension-code-block-lowlight
pnpm add @tiptap/extension-mathematics katex
pnpm add lowlight   # syntax highlighting
```

### Week 1 — Core Setup + Text Blocks + Auto-save

#### Files to Create

| File | Purpose |
|------|---------|
| `components/editor/editor.tsx` | Main TipTap wrapper component |
| `components/editor/block-registry.ts` | One entry per block type — the single source of truth |
| `app/api/blocks/batch/route.ts` | POST — save changed blocks |

#### Block Registry Structure
```ts
// components/editor/block-registry.ts
// Every block type is defined here ONCE.
// Never add a switch(blockType) anywhere else in the codebase.
export const BLOCK_REGISTRY: Record<BlockType, BlockDefinition> = {
  paragraph: { ... },
  h1: { ... },
  // ...
}
```

#### Text Blocks (Week 1)
| Block | Slash Command | Markdown Shortcut |
|-------|--------------|-------------------|
| Paragraph | `/paragraph` | (default) |
| Heading 1 | `/h1` | `# ` + Space |
| Heading 2 | `/h2` | `## ` + Space |
| Heading 3 | `/h3` | `### ` + Space |
| Bulleted List | `/bullet` | `- ` or `* ` + Space |
| Numbered List | `/numbered` | `1. ` + Space |
| Toggle | `/toggle` | `> ` + Space |
| Quote | `/quote` | `"` + Space |
| Callout | `/callout` | — |
| Divider | `/divider` | `---` + Enter |

#### Auto-save
- Debounce ~1 second after last keystroke
- Save changed blocks to `POST /api/blocks/batch`
- IndexedDB offline queue — buffer writes during connectivity loss, flush on reconnect
- `page_versions` snapshot — one per 10-minute window per user-session
- 200-step undo — TipTap history extension with `depth: 200`

#### Block Storage
```ts
// Each block → one row in `blocks` table
{
  id: uuid,
  page_id: uuid,
  parent_block_id: uuid | null,   // for nested blocks (columns, toggles)
  type: BlockType,                 // matches blockType enum
  content: jsonb,                  // flexible per block type
  schema_version: 1,               // ALWAYS start at 1
  order_index: integer,
}
```

### Week 2 — All Remaining Block Types + Slash Command

#### Files to Create

| File | Purpose |
|------|---------|
| `components/editor/slash-menu.tsx` | `/` command palette |
| `components/editor/blocks/todo.tsx` | Checkbox block |
| `components/editor/blocks/image.tsx` | Image block (upload + URL embed) |
| `components/editor/blocks/code-block.tsx` | Code with syntax highlight |
| `components/editor/blocks/equation.tsx` | KaTeX math block |
| `components/editor/blocks/columns.tsx` | 2–3 column layout |
| `components/editor/blocks/linked-page.tsx` | Page reference card |
| `components/editor/blocks/inline-database.tsx` | Embedded database |
| `components/editor/blocks/template-button.tsx` | Template clone button |

#### Remaining Block Types
| Category | Blocks |
|----------|--------|
| Task | To-Do (checkbox — checked state in JSONB) |
| Media | Image (10 MB), Video (50 MB), Audio (50 MB), File (100 MB) |
| Structure | Table of Contents, Simple Table, Columns (2–3 col) |
| Code & Math | Code Block (50+ languages, line numbers, copy btn), Equation (KaTeX) |
| Reference | Linked Page, Inline Database, Template Button |

#### Slash Command Menu
- Opens on `/` in editor
- Filter by block name as user types
- Arrow keys to navigate, Enter to insert, Escape to close
- Grouped by category (Text, Task, Media, Structure, Code & Math, Reference)

### Week 3 — Inline Toolbar + Drag-and-Drop + Multi-select

#### Files to Create

| File | Purpose |
|------|---------|
| `components/editor/inline-toolbar.tsx` | Floating format toolbar on text selection |

#### Inline Toolbar
Appears on text selection after 200ms delay:
| Control | Shortcut |
|---------|---------|
| Bold | `Ctrl/Cmd+B` |
| Italic | `Ctrl/Cmd+I` |
| Underline | `Ctrl/Cmd+U` |
| Strikethrough | — |
| Inline Code | `Ctrl/Cmd+E` |
| Hyperlink | `Ctrl/Cmd+K` (on selection) |
| Text Color | — |
| Highlight Color | — |
| Comment | — (opens comment composer — Phase 11) |
| Turn Into | — (convert block type) |

#### Block Drag-and-Drop
- Drag handle (⋮⋮) appears on block hover
- Reorder blocks by drag
- Update `order_index` in database on drop

#### Multi-block Selection
- Click + drag across blocks OR Shift+click
- Actions: Delete all, Duplicate all, Turn all into same type

#### `@` Mentions
- `@name` → workspace member picker → triggers notification (Phase 13)
- `@page` → page search picker → inserts live page link
- `@date` → date picker → inserts formatted date reference

### Verify Before Moving to Phase 7
```bash
pnpm typecheck
# Manual test:
# 1. Type in editor → blocks auto-save after ~1 second (check blocks table in db:studio)
# 2. Type / → slash menu appears with all block types
# 3. Insert all block types (paragraph, H1, H2, H3, bullet, numbered, toggle, code, equation, image, todo)
# 4. Drag a block → order_index updates in database
# 5. Select text → inline toolbar appears (Bold, Italic, Underline, Code, Link)
```

---

## Phase 7 — File Storage

**Duration:** 4 days
**Prerequisite:** Phase 6 (editor) complete.
**Goal:** Real file uploads for covers, icons, avatars, and all media blocks.
**Spec ref:** `doc/Features/file-storage.md`

### Storage Driver Architecture

Controlled by `STORAGE_DRIVER` in `.env`:

| Driver | Value | Files live in | Client upload |
|--------|-------|--------------|---------------|
| Local (dev) | `local` | `./uploads/` on disk | `POST /api/uploads/local` (multipart) |
| AWS S3 | `s3` | S3 bucket | `PUT` presigned URL (direct to S3) |
| Cloudflare R2 | `r2` | R2 bucket | `PUT` presigned URL (direct to R2) |

Storage abstraction: `lib/storage/index.ts` → `lib/storage/drivers/local.ts` or `lib/storage/drivers/s3.ts`.
All limits and quota logic live in `lib/storage/index.ts` (single config module — Rule 13).

### File Size Limits (Enforced at Sign Step)

| Kind | Max Size | `file_upload_kind` enum |
|------|---------|------------------------|
| Page cover | 5 MB | `page_cover` |
| Page icon | 1 MB | `page_icon` |
| User avatar | 1 MB | `user_avatar` (exempt from workspace quota) |
| Workspace icon | 1 MB | `workspace_icon` |
| Image block | 10 MB | `block_media` |
| Video block | 50 MB | `block_media` |
| Audio block | 50 MB | `block_media` |
| File block | 100 MB | `block_media` |

### Files Created

| File | Purpose |
|------|---------|
| `lib/storage/index.ts` | `getStorage()` factory + size limits + quota constant |
| `lib/storage/drivers/types.ts` | `StorageDriver` interface |
| `lib/storage/drivers/local.ts` | Local filesystem driver |
| `lib/storage/drivers/s3.ts` | S3/R2 driver (AWS SDK presigned PUT) |
| `app/api/uploads/sign/route.ts` | POST — validate → create upload slot |
| `app/api/uploads/confirm/route.ts` | POST — verify exists → mark confirmed → update quota |
| `app/api/uploads/local/route.ts` | POST — local driver: receive multipart, save to disk |
| `app/api/uploads/files/[...path]/route.ts` | GET — local driver: serve files from disk |
| `lib/jobs/handlers/cleanup-stale-uploads.ts` | Every 30 min — remove unconfirmed uploads > 30 min old |
| `lib/jobs/handlers/cleanup-orphaned-media.ts` | Daily — remove block_media no longer referenced by active blocks |
| `lib/jobs/handlers/sync-storage-usage.ts` | Daily — reconcile `bytes_used` against actual confirmed uploads |

### Upload Flow

```
1. Client: POST /api/uploads/sign  { kind, mimeType, fileSizeBytes, workspaceId?, pageId?, blockId? }
2. Server: validate MIME type, size limit, workspace quota (5 GB — user_avatar exempt)
3. Server: INSERT file_uploads row (confirmed_at = null)
4. Server: return { fileUploadId, objectKey, fileUrl, upload: { url, method, headers } }

5a. If method = "PUT"  (S3/R2):  Client PUT file bytes directly to presigned URL
5b. If method = "POST" (local):   Client POST multipart to /api/uploads/local

6. Client: POST /api/uploads/confirm  { fileUploadId }
7. Server: verify object exists → SET confirmed_at = now(), increment bytes_used
```

### Workspace Quota Rules
- Limit: 5 GB per workspace
- Check at sign step — reject 409 if `bytes_used + fileSizeBytes > 5 GB`
- `user_avatar` uploads (`workspace_id = null`) are EXEMPT from quota
- Decrement `bytes_used` only when the cleanup job actually deletes the object

### Env Vars Added (Phase 7)
```
STORAGE_DRIVER=local          # "local" | "s3" | "r2"
UPLOAD_DIR=./uploads          # local driver only — where files are saved
S3_ENDPOINT=                  # R2/MinIO only — omit for AWS S3
S3_BUCKET=pagevo
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
CDN_URL=https://cdn.example.com
```

### Verify Before Moving to Phase 8
```bash
pnpm typecheck
# Manual test with STORAGE_DRIVER=local:
# 1. Upload a page cover → file appears in ./uploads/, file_uploads row confirmed_at set
# 2. Upload a user avatar → workspace quota NOT incremented
# 3. workspace_storage_usage.bytes_used increments after non-avatar upload
# 4. GET /api/uploads/files/{objectKey} → file served correctly
# 5. Reject upload if fileSizeBytes > kind limit → returns 400
# Manual test with STORAGE_DRIVER=s3/r2 (once credentials available):
# 6. POST /api/uploads/sign → upload.method = "PUT", upload.url is a presigned S3 URL
# 7. PUT bytes to presigned URL → object appears in bucket
# 8. POST /api/uploads/confirm → confirmed_at set, bytes_used incremented
```

---

## Phase 8 — Databases

**Duration:** 3 weeks
**Prerequisite:** Phase 7 (file storage) complete.
**Goal:** Full-page and inline databases with all 4 views and all 11 property types.
**Spec ref:** `doc/Features/databases.md` + `doc/Features/database-properties.md`

### Week 1 — Database Core + Table View

#### Files to Create

| File | Purpose |
|------|---------|
| `components/database/table-view.tsx` | Spreadsheet-style grid |
| `components/database/view-switcher.tsx` | Tab bar for switching views |
| `components/database/filter-bar.tsx` | Filter controls |
| `components/database/sort-bar.tsx` | Sort controls |
| `lib/db/schema/databases.ts` | Already created in Phase 1 |
| `components/database/property-registry.ts` | One entry per property type |

#### Key Concepts
- A **database** is a `pages` row with `kind = 'database'`
- An **entry** is a `pages` row with `kind = 'entry'` and `database_id` FK set
- Entries get ALL page features: blocks, icon, cover, comments, versions, permissions, trash
- Creating a database auto-creates a default Table view row in `database_views`

#### Property Registry
```ts
// components/database/property-registry.ts
// ONE entry per property type. Never scatter switch(propertyType).
export const PROPERTY_REGISTRY: Record<PropertyType, PropertyDefinition> = {
  text:         { renderCell, renderFilter, renderSort, renderEditor },
  number:       { ... },
  select:       { ... },
  // ...
}
```

#### All 11 User Property Types
| Type | Storage in `property_values.value` | Notes |
|------|-------------------------------------|-------|
| Text | `{ text: string }` | Plain text |
| Number | `{ number: number }` | With optional format |
| Select | `{ optionId: string }` | Options in `database_properties.config` |
| Multi-Select | `{ optionIds: string[] }` | Multiple options |
| Date | `{ date: string, end?: string }` | ISO 8601 |
| Checkbox | `{ checked: boolean }` | |
| URL | `{ url: string }` | |
| Email | `{ email: string }` | |
| Phone | `{ phone: string }` | |
| Person | `{ userIds: string[] }` | `@me` resolves at creation time |
| Relation | `{ entryIds: string[] }` | Bidirectional — both sides in same tx |

#### Virtual & System Properties (NOT in `database_properties` table)
| Property | Source | Notes |
|----------|--------|-------|
| **Title** | `pages.title` | Always column 1, undeletable, not in 50-property limit |
| Created Time | `pages.created_at` | Auto-generated, read-only |
| Created By | `pages.created_by` | Auto-generated, read-only |
| Last Edited Time | `pages.updated_at` | Auto-generated, read-only |
| Last Edited By | `pages.last_edited_by` | Auto-generated, read-only |

#### Table View Features
- [ ] Spreadsheet grid — columns = properties, rows = entries
- [ ] Inline cell editing for all property types
- [ ] Add column (property) button
- [ ] Add row (entry) button at bottom
- [ ] Column resize (visual only)
- [ ] Column reorder — update `database_properties.order_index`
- [ ] Per-view show/hide columns — saved in `database_views.hidden_property_ids`

### Week 2 — Board, Calendar, Gallery Views + Filters + Sorts

#### Files to Create

| File | Purpose |
|------|---------|
| `components/database/board-view.tsx` | Kanban board |
| `components/database/calendar-view.tsx` | Month grid by date |
| `components/database/gallery-view.tsx` | Image card grid |

#### Board View
- Kanban columns grouped by a Select property (`database_views.group_by_property_id`)
- Drag cards between columns → updates Select property value
- Requires a Select property — prompt to add one if none exists
- "No Group" column for entries with no value

#### Calendar View
- Month grid, entries placed on dates from a Date property (`database_views.calendar_property_id`)
- Requires a Date property — prompt to add one if none exists
- Click a date → create entry with that date pre-filled
- Entries spanning date ranges span multiple days

#### Gallery View
- Card grid with title, cover image (if set), configurable display properties
- Card sizes: small / medium / large — saved in `database_views.gallery_card_size`
- `card_display_props` — which properties appear on card face

#### Filters (AND/OR Logic)
- [ ] Filter by any property with type-appropriate operators
- [ ] AND group (all conditions match) + OR group (any condition matches)
- [ ] Applied at SQL level — never post-fetch
- [ ] Saved per view in `database_views.filters` JSONB

#### Sorts (Up to 5 Stacked)
- [ ] Any property, ascending/descending
- [ ] Saved per view in `database_views.sorts` JSONB

#### Multiple Named Views
- [ ] Add view, rename view, delete view
- [ ] Minimum 1 view — last view cannot be deleted
- [ ] View tabs at top of database

### Week 3 — Relation Properties + Entry Pages + Inline Mode

#### Relation Property (Bidirectional)
- Creating a Relation property → auto-creates a back-relation property in the target database
- Writing A→B **also writes B→A in the same transaction**
- On entry delete → scrub deleted entry's ID from all back-referenced `property_values` in delete transaction
- On Relation property delete → also delete back-relation + all values in same transaction
- Relation values stored as `{ entryIds: string[] }` in `property_values.value` on BOTH sides

#### Entry Pages
- Clicking an entry row → open as full page
- Entry has: block editor, icon, cover, breadcrumbs, comments, version history, permissions
- Open modes: side panel OR full page — saved per view in `database_views.entry_open_mode`
- Route: same as regular pages — `app/(app)/[workspace]/[pageId]/page.tsx`

#### Inline Database Mode
- Database embedded inside a page via the `database` block type
- Block stores the `databaseId`; the database is a separate pages row
- Renders all views inline, full functionality

#### Business Rules to Enforce
- Max 50 user-created properties per database — enforce in app, return 400 if exceeded
- Board view requires Select property for grouping; Calendar requires Date property
- Select option delete → clear that option from all entries' `property_values`

### Verify Before Moving to Phase 9
```bash
pnpm typecheck
# Manual test:
# 1. Create a database → default Table view auto-created
# 2. Add 3 properties (text, select, date) → max 50 limit enforced
# 3. Switch Table/Board/Calendar/Gallery views
# 4. Filter by select property → filtered at SQL level (check EXPLAIN)
# 5. Sort by date → results ordered correctly
# 6. Create a Relation property between two databases → back-relation appears in target database
```

---

## Phase 9 — Templates

**Duration:** 4 days
**Prerequisite:** Phase 8 (databases) complete.
**Goal:** Built-in template gallery + custom workspace templates.
**Spec ref:** `doc/Features/templates.md`

### Files to Create

| File | Purpose |
|------|---------|
| `components/templates/template-gallery.tsx` | Browse + search templates |
| `components/templates/template-preview.tsx` | Preview before applying |
| `app/api/templates/route.ts` | GET list, POST create custom |
| `app/api/templates/[id]/route.ts` | GET, PATCH, DELETE |
| `app/api/templates/[id]/apply/route.ts` | POST — copy snapshot as new page |

### Template Types
| Type | `workspace_id` | Who Authors | Who Can See |
|------|---------------|-------------|------------|
| Built-in | NULL | Pagevo team via Orbit Admin | All users |
| Custom | workspace UUID | Workspace members | That workspace only |

### Rules
- Max 5 custom templates per workspace
- Only creator or workspace Admin can edit/delete custom templates
- Entries are NEVER saved in `page_snapshot` — structure only
- Built-in templates authored and managed in Orbit Admin (Phase 16)

### Template Button Block
- Configured at authoring time with a predefined block structure
- Clicking the button in editor → inserts those blocks at cursor position
- Block's `content` JSONB stores the template block structure

### Verify Before Moving to Phase 10
```bash
pnpm typecheck
# Manual test:
# 1. Open template gallery → built-in templates appear
# 2. Apply a template → new page created with correct block structure
# 3. Create custom template → max 5 per workspace enforced
# 4. Template button block → clicking it inserts the configured blocks
```

---

## Phase 10 — Global Search

**Duration:** 4 days
**Prerequisite:** Phase 9 (templates) complete.
**Goal:** `Ctrl/Cmd+K` searches all workspace content using PostgreSQL FTS.
**Spec ref:** `doc/Features/search.md`

### How the Index Is Maintained (Already Set Up in Phase 1 Migration)
- `search_index` table with `search_vector` (`tsvector` with GIN index)
- Triggers fire automatically on data changes:
  - `pagevo_search_upsert()` — on `blocks.content` change (weight C), page title change (weight A)
  - `pagevo_entry_search_upsert()` — on `property_values.value` change (weight B/C)
  - `pagevo_comment_search_upsert()` — on `comments.content` change (weight D)
- No separate reindex job needed

### Files to Create

| File | Purpose |
|------|---------|
| `app/api/search/route.ts` | GET — FTS query, permission-filtered |
| `components/search/search-modal.tsx` | `Ctrl+K` palette |

### Search API
```ts
// GET /api/search?q=term&workspace=id&type=page&after=date&author=userId
// - tsquery: plainto_tsquery('english', q)
// - Scoped to workspace_id
// - Permission-filtered at SQL level (recursive CTE)
// - Never surface: is_deleted = true OR is_private = true (unless requester is creator)
// - Cap: 50 results
// - Return: title, snippet (highlighted match), sourceType, pageUrl, updatedAt
```

### `Ctrl+K` Command Palette
- [ ] Open on `Ctrl+K` / `Cmd+K` globally (except when `Ctrl+K` is used on text selection for hyperlink)
- [ ] Shows Recently Visited pages before any query is typed
- [ ] Real-time results as user types (debounced 300ms)
- [ ] Arrow keys to navigate, Enter to open, Escape to close
- [ ] Result filters: by location, type (pages/databases/comments), date, author

### Verify Before Moving to Phase 11
```bash
pnpm typecheck
# Manual test:
# 1. Ctrl+K opens palette, shows recently visited pages
# 2. Type a search term → FTS results appear, private pages excluded for non-owner
# 3. Run: EXPLAIN ANALYZE on search query → must show Index Scan not Seq Scan
```

---

## Phase 11 — Comments & Mentions

**Duration:** 1 week
**Prerequisite:** Phase 10 (search) complete.
**Goal:** Threaded comments on blocks and pages, `@` mentions in content.
**Spec ref:** `doc/Features/comments.md`

### Files to Create

| File | Purpose |
|------|---------|
| `app/api/pages/[id]/comments/route.ts` | GET list, POST create |
| `app/api/comments/[id]/route.ts` | PATCH edit, DELETE |
| `app/api/comments/[id]/resolve/route.ts` | POST resolve thread |
| `app/api/comments/[id]/reopen/route.ts` | POST reopen thread |
| `components/editor/comment-panel.tsx` | Right-side comment panel |

### Comment Types
| Type | `block_id` | `anchor_start/end` | Use Case |
|------|-----------|-------------------|---------|
| Block-level | set | null | Comment on a specific block |
| Text-range | set | set | Comment on selected text |
| Page-level | null | null | General page feedback |

### Business Rules
- Replies are **one level deep only** — `parent_id` is never a reply row
- Deleting a thread root WITH replies → `deleted_at = now()` (soft delete), render `"[Comment deleted]"`
- Deleting a thread root WITH NO replies → hard delete the thread
- Only author can edit; author or workspace Admin can delete
- `@mention` notification fires **once at mention time** — NOT again on edit
- `thread_number` is unique per page — shown as `#3` in comment panel
- FTS trigger on `comments.content` already wired from Phase 1 migration

### Verify Before Moving to Phase 12
```bash
pnpm typecheck
# Manual test:
# 1. Add a comment on a page → comment appears in panel
# 2. @mention a teammate → notification row inserted in same transaction
# 3. Reply to a comment → thread depth is 1 level max
# 4. Resolve a comment thread → thread shows as resolved
# 5. Edit your own comment → only author can edit (403 for others)
```

---

## Phase 12 — Permissions & Sharing

**Duration:** 1 week
**Prerequisite:** Phase 11 (comments) complete.
**Goal:** Page-level permissions, public links, and guest access — all enforced at SQL level.
**Spec ref:** `doc/Features/permissions.md`

### Files to Create

| File | Purpose |
|------|---------|
| `lib/permissions/resolver.ts` | **Full implementation** of permission resolver |
| `app/api/pages/[id]/permissions/route.ts` | GET, POST, PATCH, DELETE page permissions |
| `app/api/pages/[id]/public-link/route.ts` | GET, POST, DELETE public link |
| `app/api/pages/[id]/guest-invite/route.ts` | POST invite guest |
| `components/pages/share-panel.tsx` | Share & permissions panel |

### `lib/permissions/resolver.ts` — Full Implementation

```ts
// These are the ONLY functions that resolve permissions.
// All API routes call these — never implement permission checks inline.

export async function requireSession(headers: Headers): Promise<Session>
// Throw 401 if no valid session

export async function requireWorkspaceMember(
  db: DB, userId: string, workspaceId: string, minRole: WorkspaceRole
): Promise<WorkspaceMember>
// Throw 403 if not a member or below minRole

export async function requirePagePermission(
  db: DB, userId: string, pageId: string, minLevel: AccessLevel
): Promise<{ effectiveLevel: AccessLevel }>
// Single recursive CTE that walks parent_id up to first page_permissions row,
// then falls back to workspaces.default_page_access.
// is_private = true → only creator + explicit grants → throw 403 for everyone else
// Throw 403 if effectiveLevel < minLevel

export async function getEffectivePermission(
  db: DB, userId: string, pageId: string
): Promise<AccessLevel | null>
// Same logic but returns null instead of throwing (for UI display)
```

### Permission Resolution Order (Non-Private Pages)
1. User is workspace Admin → Full Access (unless page is private)
2. Explicit `page_permissions` row for user → use that level
3. Walk `parent_id` up recursively → first explicit permission found → inherit it
4. Fall back to `workspaces.default_page_access`
5. No match → no access

### Private Pages (`is_private = true`)
- Skip steps 1, 3, 4 above entirely
- Only creator + users with explicit `page_permissions` row can access
- Workspace Admins are also denied (intentional)
- Does NOT appear in sidebar or search for anyone except the creator
- Platform Admins (Orbit) can see titles only (not content)

### Workspace Role Ceiling
Before inserting/updating any `page_permissions` row:
- Viewer → max `can_view`
- Editor → max `can_edit` (but Full Access on pages they own)
- Admin → any level

Never trust client-supplied `access_level` directly — always enforce ceiling.

### Public Links
- Generate token → enable → shareable URL (no login required)
- Access levels: `can_view` or `can_comment`
- Disable → new token generated → old URL dead permanently (never reactivates)

### Guest Invitations
- Invite external email to one specific page
- Levels: `can_view`, `can_comment`, `can_edit`
- 7-day expiry; guest signs in via magic-link with invited email
- Guest sees only the explicitly invited page(s) — not the full workspace

### Verify Before Moving to Phase 13
```bash
pnpm typecheck
# Manual test:
# 1. Share page with a member → access_granted notification created
# 2. Share page publicly → open URL in incognito → read-only access
# 3. Private page → Admin cannot see it (403) → only creator can open
# 4. EXPLAIN ANALYZE permission CTE query → must show Index Scan
# 5. Workspace role ceiling → Viewer cannot be granted can_edit
```

---

## Phase 13 — Notifications

**Duration:** 1 week
**Prerequisite:** Phase 12 (permissions) complete.
**Goal:** Real-time in-app notifications + email delivery via pg-boss.
**Spec ref:** `doc/Features/notifications.md`

### Files to Create

| File | Purpose |
|------|---------|
| `app/api/notifications/route.ts` | GET list (polling fallback), PATCH mark read |
| `app/api/notifications/stream/route.ts` | GET SSE stream — must run on Railway (not Vercel serverless) |
| `components/notifications/notification-bell.tsx` | Bell icon with unread badge |
| `components/notifications/notification-center.tsx` | Panel listing all notifications |
| `lib/notifications/triggers.ts` | Functions called to trigger each notification type |
| `lib/jobs/handlers/send-notification-email.ts` | pg-boss handler |
| `lib/jobs/handlers/send-email-digest.ts` | pg-boss handler |
| `lib/jobs/handlers/cleanup-notifications.ts` | pg-boss handler (nightly cleanup) |
| `lib/email/templates/mention.ts` | Email template |
| `lib/email/templates/comment-reply.ts` | Email template |
| `lib/email/templates/digest.ts` | Email template |
| `lib/email/templates/trash-warning.ts` | Email template |
| `lib/email/templates/guest-invite.ts` | Email template |

### All 9 Notification Types

| Type | Trigger Event | Enqueued In |
|------|--------------|-------------|
| `mention` | `@name` used in block/comment | Same tx as block/comment save |
| `comment` | Comment added to page you own | Same tx as comment save |
| `reply` | Reply in a thread you're in | Same tx as reply save |
| `resolved` | Thread resolved | Same tx as resolve update |
| `reopened` | Thread reopened | Same tx as reopen update |
| `access_granted` | Page shared with you | Same tx as page_permissions insert |
| `workspace_invite` | You're invited to workspace | Same tx as workspace_members insert |
| `guest_accepted` | Guest accepted your invite | Same tx as guest_invitations update |
| `trash_warning` | Your page nears 30-day deletion | `warn-expiring-trash` job |

### SSE Stream
```
GET /api/notifications/stream
- Returns text/event-stream
- Keep-alive ping every 30 seconds
- MUST run on Railway or persistent Node server (not Vercel serverless)
- Client EventSource auto-reconnects on disconnect
- On reconnect: GET /api/notifications?since=lastEventTimestamp (catch-up poll)
```

### `email_outbox` Pattern (Idempotent Delivery)
```
1. Notification trigger → INSERT email_outbox (status='queued') + enqueue pg-boss job
   — Both in the SAME transaction as the triggering action —
2. Worker: read email_outbox row, call Nodemailer, update status queued→sending→sent
3. Row UUID used as SMTP Message-ID → duplicate job runs never double-send
4. Failed: status='failed', never auto-resend
5. Cleanup: nightly job purges 'sent' rows > 30 days, resets stuck 'sending' > 10min → 'failed'
```

### pg-boss Jobs

| Job | Schedule | Handler |
|-----|---------|---------|
| `send-notification-email` | On event | `lib/jobs/handlers/send-notification-email.ts` |
| `send-email-digest` | Daily 08:00 user TZ / Weekly | `lib/jobs/handlers/send-email-digest.ts` |
| `cleanup-notifications` | Nightly | `lib/jobs/handlers/cleanup-notifications.ts` |
| `warn-expiring-trash` | Daily 02:00 UTC | `lib/jobs/handlers/warn-expiring-trash.ts` |
| `auto-delete-expired-trash` | Daily 02:00 UTC | `lib/jobs/handlers/auto-delete-expired-trash.ts` |
| `cleanup-stale-uploads` | Every 30 min | `lib/jobs/handlers/cleanup-stale-uploads.ts` |
| `cleanup-orphaned-media` | Daily | `lib/jobs/handlers/cleanup-orphaned-media.ts` |
| `sync-storage-usage` | Daily | `lib/jobs/handlers/sync-storage-usage.ts` |

### Transactional Rule
- Every `notifications` INSERT and `email_outbox` INSERT happens inside the same transaction as the triggering action
- Never notify a user of their own action (check `senderId !== recipientId`)
- Digest emails skip empty digests (no items → no email)

### Verify Before Moving to Phase 14
```bash
pnpm typecheck
# Manual test:
# 1. @mention teammate → notification bell increments → email arrives (realtime mode)
# 2. SSE stream stays connected for 60+ seconds (ping keeps it alive)
# 3. Page comment → page owner gets notification (not the commenter themselves)
# 4. email_outbox row: queued → sending → sent state machine
# IMPORTANT: SSE route must be deployed on Railway, not Vercel serverless
```

---

## Phase 14 — Onboarding

**Duration:** 4 days
**Prerequisite:** Phase 13 (notifications) complete.
**Goal:** New users are guided to a productive workspace in under 5 minutes.
**Spec ref:** `doc/Features/onboarding.md`

### Files to Create

| File | Purpose |
|------|---------|
| `app/(app)/onboarding/page.tsx` | Setup wizard |
| `components/onboarding/onboarding-wizard.tsx` | 4-step wizard shell |
| `components/onboarding/steps/profile.tsx` | Step 1 |
| `components/onboarding/steps/workspace.tsx` | Step 2 |
| `components/onboarding/steps/invite.tsx` | Step 3 |
| `components/onboarding/steps/template.tsx` | Step 4 |
| `components/onboarding/tooltip-tour.tsx` | 5-step tooltip tour |
| `components/onboarding/hint.tsx` | Dismissable contextual hints |

### Setup Wizard (4 Steps)

| Step | `onboarding_step` | Fields |
|------|------------------|--------|
| Profile | 1 | Display name (required), job title (optional), timezone |
| Workspace | 2 | Create new (name + icon) OR paste invite link to join |
| Invite Teammates | 3 | Add emails + role, send invite emails |
| Choose Template | 4 | Pick from template gallery OR start blank |

Tracked via `users.onboarding_step` (0–4) and `users.onboarding_completed`.
After step 4 → set `onboarding_completed = true` → redirect to workspace.

### Tooltip Tour (5 Steps, runs after wizard)
1. Sidebar — "Your pages live here"
2. Editor toolbar — "Format text with these tools"
3. Slash command — "Type / to insert any block"
4. Database views — "Switch between Table, Board, Calendar, Gallery"
5. Search — "Press Ctrl+K to search everything"

Tracked via `users.tour_completed`. "Skip Tour" → set `tour_completed = true`.

### Contextual Hints
- One-time dismissable tips on first encounter of a feature
- Each has a unique `hint_key` string
- Dismissed state stored in `user_hint_states`
- Never shown again after dismissed

Example hints: "Type / to insert a block", "Drag blocks to reorder", "Click + to add a cover image"

### Verify Before Moving to Phase 15
```bash
pnpm typecheck
# Manual test:
# 1. New user signs in → redirected to /onboarding
# 2. Complete all 4 wizard steps → onboarding_completed = true, redirected to workspace
# 3. Tooltip tour runs after wizard → "Skip Tour" → tour_completed = true
# 4. Contextual hint appears once then never again after dismiss
```

---

## Phase 15 — Settings

**Duration:** 4 days
**Prerequisite:** Phase 14 (onboarding) complete.
**Goal:** User profile, session management, notification preferences, workspace configuration.
**Spec ref:** `doc/Features/settings.md`

### Files to Create

| File | Purpose |
|------|---------|
| `app/(app)/[workspace]/settings/page.tsx` | Settings page container |
| `components/settings/settings-modal.tsx` | Modal with 5 section tabs |
| `components/settings/profile-section.tsx` | My Profile |
| `components/settings/sessions-section.tsx` | Active sessions |
| `components/settings/notifications-section.tsx` | Email frequency prefs |
| `components/settings/workspace-general-section.tsx` | Workspace config |
| `components/settings/workspace-members-section.tsx` | Members management |

### 5 Settings Sections

**1 — My Profile**
- Display name (editable, required)
- Job title (editable, optional)
- Avatar upload (1 MB max, S3, exempt from workspace quota)
- Email address (read-only — magic-link auth)
- Timezone selector (IANA timezone list)

**2 — Sessions**
- List all active sessions: device, browser, IP, location (GeoIP optional), last active time
- Revoke any individual session (except current)
- "Sign out of all devices" → delete all sessions except current

**3 — Notifications**
- Email frequency: Realtime / Daily Digest / Weekly Digest / Off
- Weekly digest day (0=Sun … 6=Sat)
- Saved to `notification_preferences`

**4 — Workspace General** (Admin only)
- Name (editable)
- Icon / avatar (S3 upload, 1 MB)
- URL slug (editable — triggers `workspace_slug_redirects` row on change)
- Default page access: Shared / Private for new pages
- Storage usage progress bar (from `workspace_storage_usage`, 5 GB limit)
- Danger Zone: **Delete Workspace** (requires typing workspace name to confirm, irreversible)

**5 — Workspace Members** (Admin only)
- Member list: name, email, role, join date
- Search by name or filter by role
- Change role dropdown (Editor / Viewer only — Admin only via Transfer Ownership)
- Remove member button
- Pending invites list with cancel
- Invite by email form (name + role)
- Invite link: copy URL, enable/disable toggle, regenerate button

### Verify Before Moving to Phase 16
```bash
pnpm typecheck
# Manual test:
# 1. Edit profile name and avatar → persists on reload
# 2. Active sessions list shows current session
# 3. Revoke another session → that session can no longer access the app
# 4. Change email frequency preference → notification_preferences row updated
# 5. Admin: change workspace name → slug-redirect row created
# 6. Admin: Delete Workspace confirmation requires typing workspace name exactly
```

---

## Phase 16 — Orbit Admin

**Duration:** 1 week
**Prerequisite:** Phase 15 (settings) complete.
**Goal:** Internal platform operations dashboard for the Pagevo team.
**Spec ref:** `doc/Features/admin-panel.md`

### Access Control
- Route group: `app/orbit/`
- Guard: `users.is_platform_admin = true` — set via SQL only, no UI to grant this
- No end user or workspace Admin can access

### Files to Create

| File | Purpose |
|------|---------|
| `app/orbit/layout.tsx` | Orbit layout — verify is_platform_admin |
| `app/orbit/page.tsx` | Platform analytics dashboard |
| `app/orbit/users/page.tsx` | User management |
| `app/orbit/workspaces/page.tsx` | Workspace management |
| `app/orbit/templates/page.tsx` | Built-in template authoring |
| `app/orbit/audit/page.tsx` | Audit log |
| `app/api/orbit/users/route.ts` | Platform user ops |
| `app/api/orbit/workspaces/route.ts` | Platform workspace ops |
| `app/api/orbit/templates/route.ts` | Built-in template CRUD |

### Sections

#### User Management (`/orbit/users`)
- List all users, search by email/name
- Ban user (reason required, optional expiry) → revoke all sessions immediately
- Unban user
- Impersonate user → creates session marked with `impersonated_by`, 2-hour hard cap via `beforeRefresh` hook
- Revoke all sessions for a user

#### Workspace Management (`/orbit/workspaces`)
- List all workspaces with member count + storage usage
- View workspace members
- Delete workspace

#### Template Management (`/orbit/templates`)
- Create, edit, preview, publish, unpublish built-in templates
- This is where all 18 built-in templates are authored before launch

#### Platform Analytics (`/orbit/`)
- Total users (DAU/MAU), active workspaces, total storage used, job queue health

#### Audit Log (`/orbit/audit`)
- Read-only view of `platform_audit_log`
- Every Orbit mutation writes here automatically

### Audit Log Rule
**Every single Orbit mutation** (ban, unban, impersonate, revoke, delete, template publish) must write a row to `platform_audit_log` in the same transaction:
```ts
await tx.insert(platformAuditLog).values({
  actorId: session.userId,
  action: "user.banned",
  targetType: "user",
  targetId: targetUserId,
  metadata: { reason, expiresAt }
})
```

### Verify Before Moving to Phase 17
```bash
pnpm typecheck
# Manual test:
# 1. Set users.is_platform_admin = true via SQL → /orbit/ is accessible
# 2. Ban a user → their sessions revoked immediately → platform_audit_log row inserted
# 3. Impersonate a user → session has impersonated_by set → expires after 2 hours
# 4. Create/publish a built-in template in Orbit → appears in template gallery for all users
# 5. Non-platform-admin trying /orbit/ → 403
```

---

## Phase 17 — Testing & CI/CD

**Duration:** 2–3 weeks
**Prerequisite:** All phases 0–16 complete.
**Goal:** Production-ready test coverage and automated deployment pipeline.
**Spec ref:** `doc/Features/development-plan.md § Testing`

### Packages to Install

```bash
pnpm add -D vitest @vitest/ui @vitejs/plugin-react
pnpm add -D playwright @playwright/test
pnpm add -D testcontainers  # spin up real PostgreSQL in CI
```

### Vitest Unit + Integration Tests

Use a **real PostgreSQL database** (via Docker/testcontainers) — no mocks.

| Test | What to Verify |
|------|----------------|
| Permission CTE | Admin access, Viewer ceiling, private page denial, inherited permission from grandparent |
| Closure table | `insertPageWithClosure`, `movePageWithClosure` produce correct ancestor/descendant rows |
| Bidirectional relation | Writing A→B also writes B→A in same transaction |
| FTS triggers | `blocks`, `property_values`, `comments` changes correctly update `search_index` |
| Job handlers | Run each handler twice — verify same final state (idempotency) |
| File upload flow | Presign → S3 PUT → confirm → quota increment |
| Notification transactionality | Failed parent tx → no notification row created |

### Playwright E2E Tests

Critical user flows:

```
1. Sign up → receive magic link → click link → land in onboarding wizard
2. Complete onboarding → create workspace → tour runs
3. Create page → type blocks (paragraph, H1, to-do, code block)
4. Upload an image via drag-and-drop into editor
5. Create database → add 3 properties → add 5 entries → switch Table/Board/Gallery views
6. Add filter → verify entries filtered → clear filter
7. Ctrl+K → type search term → navigate to result
8. Add block comment → @mention teammate → teammate sees notification bell
9. Share page publicly → open public URL in incognito → verify read-only access
10. Admin invites member → member accepts → member sees workspace
```

### Performance Checks

```sql
-- Run these after Phase 12 and verify index usage
EXPLAIN ANALYZE
  SELECT effective_level FROM get_page_permission(:userId, :pageId);

EXPLAIN ANALYZE
  SELECT * FROM search_index
  WHERE workspace_id = :workspaceId
  AND search_vector @@ plainto_tsquery('english', :query)
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', :query)) DESC
  LIMIT 50;
```

Both queries must show `Index Scan` — not `Seq Scan`. Add indexes if needed.

### CI Pipeline

```yaml
# .github/workflows/ci.yml (to create in Phase 17)
on: [push, pull_request]
jobs:
  test:
    steps:
      - pnpm install
      - pnpm typecheck
      - pnpm lint
      - docker run postgres:16 (for integration tests)
      - pnpm db:migrate
      - pnpm test
  e2e:
    steps:
      - pnpm build
      - pnpm test:e2e
  deploy:
    if: branch == main && tests pass
    steps:
      - deploy to Railway / Vercel
```

---

## Timeline Summary

| Phase | Feature | Est. Duration |
|-------|---------|--------------|
| **0** | Pre-development fixes | 3 days |
| **1** | Full database schema + migration | 1 week |
| **2** | Auth cleanup (magic-link only) | 3 days |
| **3** | Workspaces + member management | 1 week |
| **4** | Navigation + sidebar page tree | 1 week |
| **5** | Pages (CRUD, icon, cover, versions, trash) | 1 week |
| **6** | Block editor (TipTap + all blocks + auto-save) | 3 weeks |
| **7** | File storage (presign + confirm + cleanup jobs) | 4 days |
| **8** | Databases (4 views + 11 properties + relations) | 3 weeks |
| **9** | Templates (built-in + custom + template button) | 4 days |
| **10** | Global search (FTS + Ctrl+K palette) | 4 days |
| **11** | Comments + mentions | 1 week |
| **12** | Permissions + sharing + public links + guests | 1 week |
| **13** | Notifications (SSE + email + pg-boss jobs) | 1 week |
| **14** | Onboarding (wizard + tour + hints) | 4 days |
| **15** | Settings (profile + sessions + workspace) | 4 days |
| **16** | Orbit Admin | 1 week |
| **17** | Testing + CI/CD | 3 weeks |
| | **Total MVP** | **~20 weeks** |

---

## Post-MVP Roadmap

| Phase | Scope | Timeline |
|-------|-------|---------|
| Phase 2 | Real-time multiplayer (Yjs CRDT + WebSocket), multiplayer cursors, dark mode, page analytics | +12–16 weeks |
| Phase 3 | Public REST API + webhooks, SSO/SAML, iOS app, Android app | +16–20 weeks |
| Phase 4 | AI writing assistant, semantic search, whiteboard, custom domains | TBD |
| Phase 5 | Plugin marketplace, Slack/GitHub/Zapier integrations, Jira import | TBD |

---

## Where to Start Tomorrow

1. **Phase 0** — Remove Google OAuth, reorganize `lib/db/`, rename `lib/worker/` → `lib/jobs/`, update `drizzle.config.ts`
2. **Phase 1** — Write all 12 schema files in `lib/db/schema/`, run `pnpm db:generate`, append the 3 SQL blocks, run `pnpm db:migrate`
3. Verify: `pnpm typecheck` passes, `pnpm dev` starts, `pnpm db:studio` shows all tables
4. Then proceed phase by phase — each phase depends on all previous phases

**Always read the relevant spec doc before starting each phase:**
- Phase 3 → `doc/Features/workspace.md`
- Phase 4 → `doc/Features/navigation.md`
- Phase 5 → `doc/Features/pages.md`
- Phase 6 → `doc/Features/editor.md`
- Phase 7 → `doc/Features/file-storage.md`
- Phase 8 → `doc/Features/databases.md` + `doc/Features/database-properties.md`
- Phase 9 → `doc/Features/templates.md`
- Phase 10 → `doc/Features/search.md`
- Phase 11 → `doc/Features/comments.md`
- Phase 12 → `doc/Features/permissions.md`
- Phase 13 → `doc/Features/notifications.md`
- Phase 14 → `doc/Features/onboarding.md`
- Phase 15 → `doc/Features/settings.md`
- Phase 16 → `doc/Features/admin-panel.md`
- Phase 17 → `doc/Features/development-plan.md § Testing`
