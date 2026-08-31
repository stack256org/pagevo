# Self-Hosting Pagevo

The complete guide for running your own instance of Pagevo — from `git clone` to a working team workspace. Two setup paths are covered: **Docker Compose** (recommended — one command, everything included) and **manual/Node** (for development or if you'd rather not use containers).

Every external credential this app can use — database, file storage, email, OAuth — has a **free, self-hosted, zero-account alternative** documented below. Sign-in itself can be configured the same way: pick email + password and you don't need any outside service at all, not even for authentication. You genuinely do not need to sign up for anything to get a fully working instance.

---

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Docker + Docker Compose | any recent version | The recommended path (§2) |
| Node.js | 20+ (Docker image uses 22) | Manual/Node path (§3) only |
| pnpm | matches `packageManager` in `package.json` — install via `corepack enable` | Manual/Node path only |
| PostgreSQL | 16+ | Manual/Node path only — Docker Compose runs Postgres for you |
| Git | any | Both paths |

You do **not** need, for either path: a database account, an S3 account, an SMTP provider, or Google Cloud credentials. Those are all optional upgrades — see §4-7 for every alternative, credential by credential.

---

## 2. Docker Compose (recommended)

```bash
git clone <your-fork-url> pagevo
cd pagevo
cp .env.example .env
```

Open `.env` and set at minimum:
```bash
APP_SECRET=<run: openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000     # or your real domain in production
```
Everything else can stay at its default for a first run.

```bash
# Build and start Postgres + the app + the worker.
# The -f docker-compose.local.yml part publishes the app on http://localhost:3000
# — drop it when you run behind a reverse proxy (Dokploy/Traefik, Caddy, nginx),
# which reaches the app over the Docker network instead. See §11.
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# Apply the database schema (first run, and again after any update that ships new migrations)
docker compose run --rm migrate
```

Open `http://localhost:3000`. Since SMTP isn't configured yet, your magic-link sign-in URL will be printed to the worker's logs instead of emailed:
```bash
docker compose logs -f worker
```
Copy the link from there to sign in the first time.

**Want local self-hosted stand-ins for S3 and SMTP instead of the console log / local disk defaults?**
```bash
docker compose --profile extras up -d
```
This starts **Mailpit** (a fake SMTP server with a web inbox at `http://localhost:8025`) and **MinIO** (self-hosted S3-compatible storage, console at `http://localhost:9001`) alongside everything else — see §5 and §6 for how to point Pagevo at them.

**Become an instance admin** (see §8 for what this unlocks):
```bash
docker compose exec app pnpm make:admin you@example.com
```

**Useful commands:**
```bash
docker compose ps                    # status of all services
docker compose logs -f app worker    # tail logs
docker compose down                  # stop everything (data persists in named volumes)
docker compose run --rm migrate      # re-run after pulling an update with new migrations
```

This is what the compose file wires together:

| Service | Role |
|---|---|
| `postgres` | Postgres 16, data persisted in the `postgres_data` volume |
| `migrate` | One-shot: applies Drizzle migrations, then exits — re-run manually after updates |
| `app` | The Next.js server on container port `3000`. Only reachable inside the Docker network by default — add `-f docker-compose.local.yml` to publish it on the host (override the host port with `APP_PORT` in `.env`) |
| `worker` | The pg-boss background worker — email, digests, cleanup jobs |
| `mailpit` *(optional, `--profile extras`)* | Fake SMTP + web inbox, no account needed |
| `minio` *(optional, `--profile extras`)* | Self-hosted S3-compatible storage, no account needed |

File uploads (when using the default local-disk driver) persist in the `uploads` named volume, shared between `app` and `worker` so cleanup jobs can reach the same files.

**Not using Compose?** The app image also has a `HEALTHCHECK` baked in directly (checking `/api/health`, which itself verifies database connectivity), so `docker run` reports container health the same way even without `docker-compose.yml`'s own healthcheck block.

**Prefer not to build locally?** CI publishes prebuilt app/migrator/worker images to GitHub Container Registry on every merge to `main` — see [`.github/workflows/release.yml`](.github/workflows/release.yml). Use `docker-compose.images.yml` instead of `--build`:
```bash
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
docker compose run --rm migrate
```
Pin a version with `IMAGE_TAG=0.1.0` (see the file's own comments for the full tag list). Still building from source? Nothing above changes — `docker-compose.yml` alone continues to build with `--build` as shown earlier in this section.

---

## 3. Manual / Node setup (no Docker)

```bash
git clone <your-fork-url> pagevo
cd pagevo
corepack enable
pnpm install
cp .env.example .env
# Set APP_SECRET (openssl rand -base64 32) in .env; leave the rest at defaults.

pnpm db:local        # boots an embedded Postgres on localhost:5432 — no separate install needed
pnpm db:migrate      # apply the schema

pnpm dev             # http://localhost:3000 — runs the app and the worker together, see §9

pnpm make:admin you@example.com   # promote yourself once signed in — see §8
```

Already run your own Postgres 16 instance? Point `DATABASE_URL` at it instead of running `pnpm db:local` — see §4 for every database option.

---

## 4. Database — every option

Pagevo needs one PostgreSQL 16+ database — everything else it uses (search, the background job queue) lives inside that same database, so this is the only truly required piece of infrastructure. Pick whichever matches how much you want to manage yourself:

| Option | Setup | Best for |
|---|---|---|
| **Docker Compose's bundled Postgres** (default, recommended) | Nothing to configure — `docker compose up` starts a `postgres:16-alpine` container for you automatically, data persisted in the `postgres_data` volume | The simplest path — one command, nothing to install separately |
| **Embedded Postgres via `pnpm db:local`** | Boots a real Postgres binary on `localhost:5432`, data stored in `./.krova-postgres` — no system-wide install needed | Manual/Node development (§3), or trying the app without touching your system's own Postgres install at all |
| **Your own local/self-hosted Postgres** | Install Postgres 16+ yourself (bare metal, your own container, or a VM you manage), then point `DATABASE_URL` at it | You already run Postgres for other things and want one instance to administer |
| **Managed cloud Postgres** (Neon, Supabase, Railway, Render, DigitalOcean, AWS RDS, etc.) | Create a database with any provider, copy its connection string into `DATABASE_URL` | You want to self-host the *app* (own the code, own the data, no SaaS vendor in the product itself) while letting a managed provider handle Postgres backups/HA/scaling — still fully self-hosted in every way that matters; only the database's hosting is outsourced, by your choice |

Whichever you pick, `DATABASE_URL` (`postgresql://user:password@host:port/database`) is the only thing Pagevo needs to know. **If you're using Docker Compose's bundled Postgres, don't hand-edit `DATABASE_URL` in `.env`** — Compose builds it for you automatically from `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (§11) and overrides whatever you put there. For every other option below, set `DATABASE_URL` directly.

### 4.1 Using a managed/third-party provider instead of running your own Postgres

Using a managed database does **not** make this any less "self-hosted" — you still own the app, the code, and the data. You're only outsourcing where the Postgres process itself runs, the same way you might not run your own DNS server. Pick this if you want to self-host the *app* but not personally operate backups/HA/scaling for the *database*.

| Provider | Free tier | Setup effort | Notes |
|---|---|---|---|
| **[Neon](https://neon.tech)** | Yes — generous, serverless | Easiest | Built-in connection pooler, scales to zero when idle, instant provisioning |
| **[Supabase](https://supabase.com)** | Yes — generous | Easy | Full BaaS platform, but you only need the Postgres piece here; built-in pooler too |
| **[Railway](https://railway.app)** | Small usage-based credit, no permanent free tier | Easy | Simple UI, one-click Postgres |
| **[Render](https://render.com)** | Free tier available (expires after 90 days on the free plan) | Easy | Straightforward, note the free-tier expiry |
| **[DigitalOcean Managed Databases](https://www.digitalocean.com/products/managed-databases)** | No free tier | Easy | Predictable pricing, good docs |
| **[AWS RDS](https://aws.amazon.com/rds/postgresql/)** | 12-month free-tier instance for new AWS accounts | More involved (VPC/security groups) | Best if you're already on AWS and want IAM/VPC-level control |

Every provider ends the same way: you get a connection string like `postgresql://user:password@host:port/dbname?sslmode=require` — copy it exactly, including the `?sslmode=require` (or equivalent) query parameter; see §4.2 for why.

**Neon:** sign up → create a project (pick a region close to wherever you host the app) → **Connection Details** on the dashboard → copy the **pooled connection string** → paste into `DATABASE_URL`.

**Supabase:** sign up → create a project (set a strong DB password) → **Project Settings → Database → Connection string** → select **Transaction** mode (Supabase's pooler) → copy the URI → replace the `[YOUR-PASSWORD]` placeholder with your password → paste into `DATABASE_URL`.

**Railway:** sign up → new project → add a **PostgreSQL** service from the template gallery → open it → **Connect** tab → copy the connection string → paste into `DATABASE_URL`. (If you hit a connection error, try appending `?sslmode=require`.)

**Render:** sign up → **New → PostgreSQL** → pick name/region/plan → copy the **External Connection String** from the database's page → paste into `DATABASE_URL`.

**DigitalOcean:** sign up → **Create → Databases → PostgreSQL** → pick plan/region → once provisioned, copy the **Connection String** from the cluster's Overview page → paste into `DATABASE_URL`.

**AWS RDS:** **RDS → Create database**, engine PostgreSQL 16.x, a free-tier-eligible instance size → under Connectivity, enable public access if the app isn't in the same VPC and allow inbound TCP 5432 from your app's IP in the security group → once "Available," build the string yourself: `postgresql://<master-username>:<master-password>@<endpoint>:<port>/<db-name>?sslmode=require` → paste into `DATABASE_URL`.

### 4.2 Third-party database gotchas

**Keep `sslmode=require` in the connection string.** Pagevo's database client (`lib/db/index.ts`) doesn't set an SSL option itself — it relies entirely on what's in `DATABASE_URL`. All six providers above require SSL and their copy-paste connection strings already include the right parameter; don't strip it off if you hand-edit the string.

**Connection poolers — you're already compatible.** Serverless/managed providers (especially Neon and Supabase) want you to connect through their pooler (PgBouncer or equivalent) rather than directly, since transaction-mode poolers don't support prepared statements across requests — which normally trips up ORMs. Good news, already verified in this codebase: `lib/db/index.ts` constructs the client with `prepare: false`, which is exactly the setting required to work correctly behind a transaction-mode pooler. Nothing to change — just use the pooled connection string the provider gives you.

**Running migrations — Manual/Node setup:** works with zero extra steps, `DATABASE_URL` in `.env` is read directly: `pnpm db:migrate`.

**Running migrations — Docker Compose:** `docker-compose.yml`'s `app`, `worker`, and `migrate` services hardcode `DATABASE_URL` to the bundled `postgres` container by design, so the default zero-config path never needs `.env` edited. To point Docker at your managed database instead, use the included override file:
```bash
# set DATABASE_URL in .env to your provider's connection string first
docker compose -f docker-compose.yml -f docker-compose.external-db.yml run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.external-db.yml up -d --build app worker
```
`docker-compose.external-db.yml` (repo root) overrides `app`/`worker`/`migrate` to read `DATABASE_URL` straight from `.env`. The bundled `postgres` container still starts alongside (Compose starts declared dependencies regardless of which services you name), but nothing queries it — it's just an idle, harmless container. Reclaim the resources with `docker compose stop postgres` once `migrate`/`app`/`worker` are healthy, or remove the `postgres` service block and its `depends_on` entries from your own copy of `docker-compose.yml` if you never intend to use it.

**Backups.** You no longer need to `pg_dump` yourself — use whatever your provider offers: Neon has automatic point-in-time restore on all plans including free; Supabase has daily backups on paid plans (free tier has none — export manually via the SQL editor, or run periodic `pg_dump`s yourself if staying on free long-term); Railway/Render/DigitalOcean/AWS RDS each have automated-backup settings in their dashboard worth enabling. Uploaded files (if `STORAGE_DRIVER=local`) are separate from any of this — see §14.

### 4.3 Third-party database troubleshooting

| Symptom | Likely cause |
|---|---|
| `connection refused` | Security group / firewall on the provider's side doesn't allow your app's IP — most relevant for AWS RDS and DigitalOcean |
| `SSL required` / `no pg_hba.conf entry` error | `sslmode=require` is missing from `DATABASE_URL` — see §4.2 |
| `too many connections` | You're connecting directly instead of through the provider's pooler — switch to the pooled connection string (§4.2) |
| Docker app/worker still connect to the bundled Postgres instead of your provider | You forgot the `-f docker-compose.external-db.yml` flag, or `DATABASE_URL` isn't set in `.env` — see §4.2 |
| `docker compose run --rm migrate` succeeds but the app can't reach the database at runtime | You only passed the override file to one of the `migrate`/`up` commands — use it on both |

---

## 5. File storage — every option, including free/self-hosted ones

Can also be configured without touching `.env` at all, from **Orbit Admin → Integrations** (§8) — a DB-saved value there overrides the matching env var per field.

| Option | Setup | Best for |
|---|---|---|
| **Local disk** (default) | Nothing to configure — `STORAGE_DRIVER=local`. Files land in `./uploads` (or `UPLOAD_DIR`) | Single-server deployments, trying Pagevo out |
| **MinIO** (self-hosted, free, S3-compatible) | `docker compose --profile extras up -d`, then set: `STORAGE_DRIVER=s3`, `S3_ENDPOINT=http://minio:9000` (or `http://localhost:9000` outside Docker), `S3_BUCKET=pagevo`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` = your `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`. Create the bucket once via the console at `http://localhost:9001` or `docker compose exec minio mc mb local/pagevo` | Wanting S3-style storage without paying anyone |
| **Cloudflare R2** | `STORAGE_DRIVER=r2`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, plus your R2 access keys | Free tier is generous; no egress fees |
| **Backblaze B2** (S3-compatible API) | `STORAGE_DRIVER=s3`, `S3_ENDPOINT=https://s3.<region>.backblazeb2.com`, plus your B2 application key | Cheapest paid option if you outgrow local disk |
| **AWS S3** | `STORAGE_DRIVER=s3`, leave `S3_ENDPOINT` blank, set `S3_BUCKET`/`S3_REGION`/keys | If you're already on AWS |

**Reads are always proxied, writes are always direct.** Every stored file is served through `/api/uploads/files/*` — the app fetches the bytes from whichever driver is active (disk or bucket) and streams them back itself, so there's no public bucket, CDN, or custom domain to set up for any option above. Uploads are the one exception: the browser still `PUT`s the file straight to the bucket via a pre-signed URL (the app server never sees those bytes), which means **s3/r2 buckets need a CORS policy** allowing `PUT` from your app's origin, e.g.:
```json
[
  {
    "AllowedOrigins": ["https://your-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
Set this in your provider's console (Cloudflare: bucket → Settings → CORS Policy; MinIO/AWS S3: equivalent bucket CORS config) — add both your local dev origin and your real production origin as you go. The bucket itself does **not** need public access enabled; the app only ever needs write (`PutObject`/`DeleteObject`) and read (`GetObject`) permissions on it, both via your access key.

**Important:** if you're on local disk and using Docker, make sure the `uploads` volume (already wired in `docker-compose.yml`) is what's actually persisting your files — don't rely on the container's own filesystem, or uploads vanish on the next `docker compose up --build`.

---

## 6. Email — every option, including no signup at all

| Option | Setup | Best for |
|---|---|---|
| **None (console log)** | Leave `SMTP_HOST` blank — the default. Magic-link and notification emails are logged to the **worker's** console instead of sent | Solo testing, evaluating Pagevo before inviting anyone |
| **Mailpit** (self-hosted, free, fake SMTP) | `docker compose --profile extras up -d`, then set `SMTP_HOST=mailpit`, `SMTP_PORT=1025` (no user/pass needed). View sent mail at `http://localhost:8025` | Local development, or a private trial where you want real-looking emails without sending them anywhere |
| **Gmail SMTP** | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<App Password>` (not your regular password — generate one in your Google Account security settings) | Small teams, a handful of invites a day |
| **Free-tier transactional providers** (Brevo, Resend, Mailjet, SendGrid) | Sign up, use their SMTP credentials — all have a free tier (hundreds of emails/month) | Real teams who want deliverability without paying immediately |
| **Self-hosted mail server** (e.g. [Maddy](https://maddy.email), [Postal](https://postalserver.io)) | Point `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` at your own server | Fully independent of any third party |
| **Any other SMTP provider** (Amazon SES, Postmark, your company mail server) | Standard SMTP host/port/user/pass | Production at scale |

For teams inviting real teammates, configure real SMTP — teammates won't have terminal/log access to read their invite link otherwise. For a solo trial, the console-log default is genuinely enough.

---

## 7. Sign-in methods — email + password (primary), magic link and Google (two optional methods)

Pagevo supports (or is designed to support — see the status note below) three sign-in methods, structured around one **primary** method and two **optional** ones — not three equal, undifferentiated choices:

| Method | Role | External service required? | Alternative if you'd rather not |
|---|---|---|---|
| **Email + password** | **Primary** — the default, first-shown method | **None at all** | — this is the zero-dependency option |
| **Magic link** (passwordless email) | Optional | An SMTP provider — but see §6, the console-log fallback works for solo use | Leave it off and use password sign-in |
| **Google sign-in** | Optional | A Google Cloud OAuth client | Leave it off — the other two need no Google account |

Every credential involved has a free, self-hosted alternative — pick whichever combination matches how much you want to depend on outside services. Each method has its own On/Off switch (§7.4); the "primary" framing is about what a first-time user sees by default, not about which methods are allowed to be enabled at once.

**Status:** all three methods, and the Orbit Admin screen to turn any of them on/off per instance, are implemented and enabled by default. The exact schema, enforcement mechanism, and UI are documented as-built in `SAAS-TO-SELF-HOSTED.md` §6.

### 7.1 Email + password — the primary method (no external service needed)

This is the **default method shown first** on the sign-in page, and requires nothing beyond your own database — no SMTP, no OAuth, no third party of any kind. Users sign up with name/email/password directly, no invite email required. This is the right choice if:
- You want the simplest possible dependency graph (self-host truly air-gapped from any outside service).
- Your team doesn't want to depend on email deliverability for day-to-day sign-in.
- You want new users to have one obvious, always-available way in, regardless of which optional methods an admin has toggled on or off.

Password reset still uses email (so users aren't locked out if they forget), but degrades the same way magic links do — logged to the worker's console if SMTP isn't configured (§6), so it's not a hard requirement even then.

### 7.2 Magic link (passwordless email) — optional

An opt-in alternative alongside password sign-in, not the sole method. No setup needed beyond whatever you picked in §6 for email delivery (including the zero-setup console-log fallback for solo use).

### 7.3 Google sign-in — optional

1. Create an OAuth Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` as an authorized redirect URI.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

**If you skip this:** the other two methods work exactly the same either way — Google is purely additive, never required. The sign-in page only shows the "Continue with Google" button once these two env vars are actually set and the method is enabled (§7.4) — no dead button to click.

### 7.4 Turning methods on/off

From Orbit Admin → Authentication (`/orbit-admin/orbit/settings`): three switches, one per method, changes apply immediately with no restart. Guardrails:
- You can never disable all three at once — the last remaining enabled method can't be turned off (prevents locking every user, including admins, out of the instance).
- Google's switch can't be turned on unless `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are actually set — there's no point enabling a method with no working credentials behind it.
- Every change is written to the append-only Orbit audit log, same as any other platform-admin action.

All three methods ship **enabled by default** so nothing regresses on upgrade — dial them down from Orbit Admin to match your own security posture.

---

## 8. Becoming an instance admin (accessing `/orbit`)

**The very first account ever created on a fresh instance is auto-promoted to admin** — sign up, and you're in. For any additional admins:

```bash
# Docker:
docker compose exec app pnpm make:admin you@example.com

# Manual/Node:
pnpm make:admin you@example.com
```

Then visit `/orbit`. Run this again with any other email to add more admins later.

---

## 9. Running the background worker

The `app` container/process alone does **not** process background jobs. A separate process — the pg-boss worker — handles: sending emails, notification digests, trash auto-deletion, page-version pruning, storage-usage reconciliation, and orphaned-file cleanup.

- **Docker:** the `worker` service in `docker-compose.yml` runs automatically alongside `app`, built from `Dockerfile.worker`.
- **Manual/Node:** `pnpm dev` already runs the worker alongside the Next.js dev server (`concurrently`, see `package.json`) — no second terminal needed. In production (`pnpm build && pnpm start`), start the worker as its own process with `pnpm worker:start`. If it isn't running, the app still loads and page editing works, but invites, notifications, and cleanup jobs silently do nothing.

---

## 10. Using Pagevo day-to-day after install

1. **First-run onboarding** walks you through profile → create/join a workspace → optionally invite teammates → pick a starting template. Triggered automatically the first time you sign in with no workspace.
2. **Inviting your team**: Workspace Settings → Members → invite by email (needs SMTP, §6) or generate a shareable invite link (works even without email configured — just send the link yourself).
3. **Creating pages**: `+` in the sidebar, or a starting template from onboarding / the "Browse templates" button on a blank page.
4. **Databases**: type `/database` inside any page, or create a new page and choose "Database," for Table/Board/Calendar/Gallery views.
5. **Search**: `Ctrl/Cmd+K` from anywhere.
6. **Notifications**: the bell icon shows real-time updates via Server-Sent Events; email digest frequency is per-user under Settings → Notifications.
7. **Instance administration**: `/orbit` (§8) — manage users, view workspaces, publish built-in templates instance-wide, review the audit log.

**Known first-run quirk — empty template gallery:** built-in templates aren't part of the database migrations; they're seeded separately, either by a background job that runs every ~10 minutes, or on-demand. On a brand-new instance, "Browse templates" can show **nothing** for up to ~10 minutes after your first `docker compose up` / `pnpm worker` start. To skip the wait: sign in (you're auto-promoted to admin as the first account, §8) and the empty gallery itself now shows a one-click **"Seed default templates"** button right there for admins — no need to navigate to `/orbit/templates` first, though that page's own seed button still works too. This is a one-time step per fresh install, not something you'll hit again afterward.

---

## 11. Environment variables — full reference

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string — see §4 for every database option. Docker Compose builds this for you automatically — don't hand-edit it there. |
| `APP_SECRET` | **Yes** | — | Random 32+ char string signing sessions — `openssl rand -base64 32`. Not tied to any external account; entirely yours to generate. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | — | Public base URL of your instance — used to build magic-link and invite URLs. Read only at server runtime, never baked into a client bundle, so it's safe to change without rebuilding the Docker image. |
| `NODE_ENV` | No | `development` | Standard Node environment flag |
| `STORAGE_DRIVER` | No | `local` | `local`, `s3`, or `r2` — see §5 |
| `UPLOAD_DIR` | No | `<project-root>/uploads` | Only for `STORAGE_DRIVER=local` |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Only if `s3`/`r2` | — | See §5 for MinIO/R2/B2/AWS values |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | No | — | See §6 for every alternative |
| `EMAIL_WEBHOOK_SECRET` | No | — | Set to receive delivery-event webhooks from your SMTP provider. Self-generated, not tied to any external account. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | — | See §7 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` / `APP_PORT` | No (Docker only) | `pagevo` / `pagevo` / `pagevo` / `5432` / `3000` | Only read by `docker-compose.yml` — see §4 |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | No (Docker `--profile extras` only) | `pagevo` / `pagevo123` | Only read by the optional `minio` service |

---

## 12. Reverse proxy & production notes

**Before this instance is reachable from the internet, do these three things:**

1. **Set a real `POSTGRES_PASSWORD`** in `.env` — the default (`pagevo`) is fine for local-only use, but it's a well-known value; leaving it means anyone who can reach this host can connect straight to your database if the port is open.
2. **Remove or firewall the Postgres port mapping** — either delete the `postgres` service's `ports:` entry in `docker-compose.yml`, or make sure port 5432 isn't reachable from outside your network. Nothing else in the stack needs to reach Postgres from outside the compose network.
3. **Generate a real `APP_SECRET`** — `openssl rand -base64 32`. The app now refuses to start with anything shorter than 32 characters or the `.env.example` placeholder value, so this is enforced, not just advisory.

- **HTTPS**: terminate TLS at your reverse proxy (Caddy, Nginx, or a managed load balancer) and set `NEXT_PUBLIC_APP_URL` to the real `https://` URL.
- **The notification stream (`/api/notifications/stream`) needs a persistent connection** — a Server-Sent Events endpoint. It works natively on the Docker/Node deployment here; if you put Nginx in front, disable buffering for that path:
  ```nginx
  location /api/notifications/stream {
      proxy_buffering off;
      proxy_read_timeout 3600s;
      proxy_pass http://localhost:3000;
  }
  ```
- **Both `app` and `worker` must stay running** — use Docker Compose's `restart: unless-stopped` (already set) or your own process manager if running manually.
- **The worker scales horizontally** if you need more job throughput — jobs are claimed with `FOR UPDATE SKIP LOCKED`, so replicas never double-process a job.

---

## 13. Updating your instance

```bash
git pull

# Docker:
docker compose up -d --build
docker compose run --rm migrate

# Manual/Node:
pnpm install
pnpm db:migrate
# restart both the app process and the worker process
```

Always back up your database before applying migrations from an upstream update (§14).

---

## 14. Backup & data ownership

Everything that matters lives in two places:

1. **PostgreSQL** — all pages, blocks, permissions, comments, metadata. Back up with `pg_dump` / your usual continuous-archiving strategy, or your managed provider's own backup tooling if you picked that option in §4. Docker users on the bundled Postgres: the data lives in the `postgres_data` named volume.
2. **Uploads** — if `STORAGE_DRIVER=local`, back up the `uploads` volume (Docker) or `UPLOAD_DIR` (manual). If you're on S3/R2/B2/MinIO, back that up per your provider's own tooling.

There is no other external state to worry about — no SaaS vendor holds a copy of your data.

---

## 15. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Magic-link sign-in "does nothing" | SMTP isn't configured — check `docker compose logs -f worker` (or the worker terminal) for the logged link. The sign-in screen itself now tells you this up front instead of implying an email was sent. |
| Invites/digests/notifications never arrive | The worker isn't running — see §9 |
| "Continue with Google" button doesn't appear | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` aren't set, or the method is toggled off in Orbit Admin → Authentication (§7.4) — the button only renders once Google is actually usable, so there's nothing to click until then |
| Can't reach `/orbit` | You aren't an admin yet — the first account on a fresh instance is auto-promoted (§8); for anyone after that, run `pnpm make:admin` |
| Uploads disappear after a rebuild | The `uploads` volume isn't mounted, or `UPLOAD_DIR` isn't on a persistent volume — see §5 |
| Real-time notifications don't update behind a reverse proxy | Buffering is enabled on the SSE route — see §12 |
| `docker compose run --rm migrate` fails with an enum/type error on an *old* clone | You're on a version predating the migration-chain fix described in `SAAS-TO-SELF-HOSTED.md` §2 — pull the latest and retry |
| `docker compose run --rm migrate` succeeds against an **existing, already-migrated production database**, but `default_page_access`-related writes still fail with an enum error | Drizzle's timestamp-based migration watermark can silently skip a migration on a pre-existing database — apply the manual SQL workaround in `SAAS-TO-SELF-HOSTED.md` §2.3 once, then re-run migrate |
| Template gallery is empty right after first install | Expected on a brand-new instance — see the note in §10; the gallery's own empty state now has a one-click "Seed default templates" button for admins |
| An invite-accept or workspace-transfer link used to land on a plain scaffold "Welcome back" page | Fixed — those redirects now go to the real post-auth flow instead of the leftover scaffold dashboard (`SAAS-TO-SELF-HOSTED.md` §5.6) |
| App shows a raw/generic error page right after first install, before you've done anything else | The database hasn't been migrated yet — run `docker compose run --rm migrate` (Docker) or `pnpm db:migrate` (manual), see §2/§3. `app/error.tsx` now detects this specific case and explains it instead of showing a raw crash. |

---

## 16. Making this instance yours

Pagevo's product name, logo, and copy are centralized in `config/platform.ts` — change `PRODUCT_NAME`, `PRODUCT_DESCRIPTION`, and `LOGO_PATH` there and it propagates through page titles, email subjects, and the sidebar.

---

## 17. UI/UX improvements made for an easier self-hosted experience

All implemented — full detail (schema, enforcement, exact files) in `SAAS-TO-SELF-HOSTED.md` §5 and §6:

1. ✅ **The first registered user is auto-promoted to admin** — no `pnpm make:admin` shell command needed on first run (§8).
2. ✅ **The "Continue with Google" button only renders when Google is actually configured and enabled** — never a button that fails on click.
3. ✅ **A proactive Setup Checklist in Orbit Admin** (superseding a plain config-health banner) showing SMTP/storage/`APP_SECRET` status, so gaps are visible instead of discovered via silent failures — see point 10 below.
4. **A configurable workspace storage quota** (currently hardcoded to 5 GB) via env var — not done this pass, tracked as a nice-to-have in `SAAS-TO-SELF-HOSTED.md` §7.
5. ✅ **Reworded Orbit Admin copy** that drops the SaaS-provider-vs-customers framing ("tenant workspaces" → "workspaces on this instance").
6. ✅ **Email + password sign-in, with a per-method On/Off switch for password, magic link, and Google** — a database-backed setting (not just an env var, not just a hidden button) so an admin can react instantly, enforced inside Better Auth's request pipeline itself so a "disabled" method is actually blocked, not just hidden. Full detail in `SAAS-TO-SELF-HOSTED.md` §6.
7. ✅ **A friendly "run your migrations" error page** instead of a raw crash if the app starts before `docker compose run --rm migrate` (`app/error.tsx`, `SAAS-TO-SELF-HOSTED.md` §5.8).
8. ✅ **The "check your inbox" sign-in screen now says so when no email was actually sent** instead of always claiming a link was emailed (`SAAS-TO-SELF-HOSTED.md` §5.9).
9. ✅ **The empty template gallery now offers a real fix, not just text** — no longer names "the Pagevo team"; shows a working "Seed default templates" button for admins instead (`SAAS-TO-SELF-HOSTED.md` §5.10).
10. ✅ **A proactive first-run Setup Checklist for the instance admin**, not just a passive banner — a dismissible card on the Orbit Admin overview page checking off SMTP, storage, and `APP_SECRET`, each linking straight to where it's fixed (`SAAS-TO-SELF-HOSTED.md` §5.11).
11. ✅ **A visible instance version indicator** in the Orbit Admin sidebar footer, removing the "what am I even running" confusion that comes with self-updating via `git pull` instead of an auto-updating SaaS (`SAAS-TO-SELF-HOSTED.md` §5.12).

Still open, tracked in `SAAS-TO-SELF-HOSTED.md` §4.1 and §7: choosing and adding a LICENSE (explicitly deferred, your call), the storage-quota env var above, rate limiting, app-level lint/test CI, and a few cosmetic/hardening items.
