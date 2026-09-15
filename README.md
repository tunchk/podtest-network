# PodTest Network

Open community around software, quality, engineering, careers, and the people behind PodTest.

Milestone 1 delivers accounts, profiles, directory and manual publication moderation.
Milestone 2.1 adds optional CV → AI profile suggestions, a durable worker, sponsored credits, and assistive automated review.

## Stack (verified at implementation time)

| Package | Version |
|---|---|
| Next.js (App Router) | 16.3.5 |
| React | 19.2.8 |
| Prisma ORM | 7.10.0 |
| Better Auth | 1.7.5 |
| PostgreSQL | 15+ (local Homebrew or optional Docker) |
| Vitest | 3.2.4 |
| TypeScript | 5.x |

Auth.js/next-auth v5 remains beta; Better Auth is the maintained recommendation for new projects and is used here with the official Prisma adapter.

## Local setup

### 1. PostgreSQL

Prefer a local PostgreSQL install. Create isolated databases (never reuse Catchy/Günce DBs):

```bash
createdb podtest
createdb podtest_test
```

Optional Docker (only if Docker Desktop is available):

```bash
docker compose up -d
# then set DATABASE_URL=postgresql://podtest:podtest@127.0.0.1:5432/podtest?schema=public
```

### 2. Environment

```bash
cp .env.example .env.local
# Also keep prisma CLI DATABASE_URL in .env (see prisma7.config.ts)
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET
```

Environment variable **names** used:

- `DATABASE_URL`
- `DATABASE_URL_TEST`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CATCHYLABS_INTEGRATION_ENABLED`
- `CATCHYLABS_API_BASE_URL` (unused until M5)
- `CATCHYLABS_SERVICE_TOKEN` (unused until M5)
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_PROVIDER` (`openai`, or unset with key; `stub` only via explicit non-production demo)
- `AI_DEMO_STUB` (optional local demo; ignored/forbidden in production)
- `AI_ALLOW_STUB` (test/demo alias; cannot enable stubs in production)
- `PROFILE_PREPARE_CREDIT_COST`
- `SPONSORED_PROFILE_PREPARE_AMOUNT`
- `AI_WORKER_POLL_MS`

### 3. Install, migrate, run

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev          # web + AI worker
# or separately:
npm run dev:web
npm run worker
npm run worker:once  # process one job then exit
```

App: [http://localhost:3000](http://localhost:3000)

### 4. Bootstrap first admin

Sign up normally in the UI, then:

```bash
npm run bootstrap:admin -- you@example.com
```

Normal signup cannot choose `ADMIN` or a paid plan.

### 5. Optional capability seed (dev only)

```bash
npm run seed:capability -- you@example.com ai.profile.prepare
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Product UI language

Member-facing UI is Turkish. Engineering docs and code identifiers are English.

## Docs

- [Product](docs/product.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Credits ledger](docs/credits.md)
- [Catchylabs integration](docs/catchylabs-integration.md)
- [Build brief](PodTest_Network_Cursor_Build_Brief.md)
