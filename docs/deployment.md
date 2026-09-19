# Production deployment (platform-neutral)

This document prepares PodTest Network for a controlled production deployment.
It does **not** choose a cloud provider, Docker image, or object store.

## Architecture

Required services:

1. **Web process** — `npm start` (Next.js only)
2. **AI worker process** — `npm run worker` (separate long-running process)
3. **PostgreSQL** — shared by web and worker (`DATABASE_URL`)
4. **Shared persistent storage** — CV binaries + AI job inputs (`STORAGE_ROOT`)

```text
Browser
   |
Web process ---- PostgreSQL
   |
Shared persistent storage
   |
AI worker ------ PostgreSQL
```

Web alone is **insufficient**. Without the worker, AI preparation jobs stay queued.
Web and worker must share both the **database** and **persistent storage**.

Podcast audio/artwork stay on their existing URL sources — they are not moved into local storage.

## Environment

See `.env.example` for required / optional / dev-only variables.

Notable production settings:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Shared by web + worker |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Auth |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `ARAYANLAR_PREP_MODEL` | Live AI |
| `STORAGE_ROOT` | e.g. `/data/podtest` on a mounted volume; defaults to `<cwd>/storage` in development |
| `WORKER_ID` | Unique when running multiple workers |
| `AI_WORKER_POLL_MS` | Idle poll interval (optional) |
| `KARIYER_PORTRESI_DEFAULT_HOST_USER_ID` | Set **after** host bootstrap from the **production** user id |

AI stub variables (`AI_DEMO_STUB`, `AI_ALLOW_STUB`, `AI_PROVIDER=stub`) are **dev/test only** and are ignored/forbidden in production.

### Outbound email

There is **no** production email provider in this MVP. The development mail sink under `STORAGE_ROOT/mail-sink` is **disabled** when `NODE_ENV=production` (requests fail clearly instead of silently writing files).

Outbound email is **not required** for the current Kariyer Portresi launch path when hosts are bootstrapped with the trusted ops flag (below). Product flows that genuinely require `emailVerified` (for example some invitation accept paths) should stay off or use ops verification until a real provider exists.

## Production scripts

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run build
npm start          # web only — does not start the worker
npm run worker     # AI worker only
```

- `npm run build` already runs `prisma generate` then `next build`. Still run `db:generate` explicitly in deploy order so the client exists before migrate/build assumptions.
- Use `db:migrate:deploy` (`prisma migrate deploy`) — **never** `migrate dev` in production.
- Do **not** make `npm start` spawn the worker; orchestrate web and worker as separate processes.

## Deployment order

1. Provision PostgreSQL
2. Configure environment (see `.env.example`)
3. Mount shared persistent storage and set `STORAGE_ROOT`
4. Install: `npm ci`
5. Generate Prisma client: `npm run db:generate`
6. Migrate: `npm run db:migrate:deploy`
7. Build: `npm run build`
8. Bootstrap admin (see runbook)
9. Bootstrap host (see runbook)
10. Set `KARIYER_PORTRESI_DEFAULT_HOST_USER_ID` to the **production** host user id
11. Start web: `npm start`
12. Start worker: `npm run worker` (same `DATABASE_URL` + `STORAGE_ROOT`; unique `WORKER_ID` if scaled)
13. Smoke test (checklist below)

## Bootstrap runbook

Register the owner and host accounts through the normal signup UI first (or your controlled account-creation path).

### Admin

```bash
npm run bootstrap:admin -- owner@example.com
```

### Host

Default behavior refuses unverified emails (safe/explicit). For trusted production ops when outbound verification mail is unavailable:

```bash
npm run bootstrap:host -- host@example.com --by owner@example.com --mark-email-verified
```

- `--by` must be an **ADMIN**
- `--mark-email-verified` sets `emailVerified=true` on the target, then grants host authorization via `grantHostAuthorization()`
- Does **not** alter `staffRole`
- Idempotent if host authorization already exists
- Does **not** weaken runtime `isAuthorizedHost()`

If the host email is already verified:

```bash
npm run bootstrap:host -- host@example.com --by owner@example.com
```

### Default host user id

Obtain the production host id from the database (example):

```bash
# Example only — use your SQL client / ops tooling against the production DB
# SELECT id, email FROM "user" WHERE email = 'host@example.com';
```

Set:

```bash
KARIYER_PORTRESI_DEFAULT_HOST_USER_ID=<production-user-id>
```

**Do not** copy a local development user id into production.

## AI worker lifecycle

- Command: `npm run worker` (or `npm run worker:once` for a single drain)
- Separate required long-running process; web alone cannot complete prep jobs
- Same `DATABASE_URL` and same `STORAGE_ROOT` as web
- `WORKER_ID` should be unique when multiple workers run
- Jobs use lease-based claiming (`FOR UPDATE SKIP LOCKED`) with heartbeat refresh while work is in flight; expired leases can be reclaimed by another worker after crash
- Graceful `SIGTERM` / `SIGINT`: stop claiming new work, finish the in-flight job when practical, disconnect Prisma, exit cleanly

## Legal / public launch blocker

Controller and legal document fields still contain **placeholders** (see `LEGAL_CONTROLLER_PLACEHOLDERS` in `src/lib/legal/documents.ts`).

**Public launch is blocked** until real controller/legal fields are completed after counsel review.

Do **not** replace placeholders with invented company data.

## Production smoke-test checklist

- [ ] `GET /api/health` returns `{ "ok": true }`
- [ ] Homepage loads
- [ ] Register / login / logout
- [ ] Profile draft + publish review path (as applicable)
- [ ] Kariyer Portresi application
- [ ] CV upload
- [ ] AI prep reaches READY (worker running)
- [ ] Guest prep has no host-only content
- [ ] Host handoff
- [ ] Host notes
- [ ] Recording schedule
- [ ] Publication review
- [ ] Candidate approval
- [ ] Admin publish
- [ ] `/bolumler/[slug]` for a published episode
- [ ] Notifications
- [ ] Unrelated-user authorization checks (IDOR negatives)
- [ ] Confirm legal controller placeholders are **not** still shipping if this is a public launch
