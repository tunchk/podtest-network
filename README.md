# PodTest Network

Open community around software, quality, engineering, careers, and the people behind PodTest.

Milestone 1 delivers accounts, profiles, directory and manual publication moderation.
Milestone 2.1 adds optional CV → AI profile suggestions, a durable worker, sponsored credits, and assistive automated review.
Milestone 2.2 adds optional PodTest Arayanlar preparation (guest brief + assigned-host pack).
Milestone 3.1 adds message requests, conversations, blocks and reports.
Milestone 3.2 adds community Q&A, speaker invitations, expert FAQs and podcast episode appearances.
Milestone 3.3 adds employer workspaces, job listings and hiring member discovery (free pilot grants; no checkout).
Admin RSS import populates the existing podcast episode catalog (no audio hosting; no PodTest+).

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
- `ARAYANLAR_PREPARE_CREDIT_COST`
- `SPONSORED_ARAYANLAR_PREPARE_AMOUNT`
- `HOST_PACK_REGEN_MAX`
- `HOST_PACK_REGEN_WINDOW_MS`
- `MESSAGE_REQUEST_FREE_MONTHLY_ALLOWANCE`
- `MESSAGE_REQUEST_PLUS_MONTHLY_ALLOWANCE`
- `MESSAGE_REQUEST_EMPLOYER_MONTHLY_ALLOWANCE`
- `MESSAGE_REQUEST_COOLDOWN_DAYS`
- `MESSAGE_REQUEST_MAX_CHARS`
- `DIRECT_MESSAGE_MAX_CHARS`
- `MESSAGE_SENDS_PER_MINUTE`
- `COMMUNITY_QUESTION_TITLE_MAX` / `COMMUNITY_QUESTION_BODY_MAX` / `COMMUNITY_ANSWER_BODY_MAX`
- `COMMUNITY_QUESTIONS_PER_DAY` / `COMMUNITY_ANSWERS_PER_DAY`
- `SPEAKER_INVITATION_TTL_HOURS` / `EMAIL_VERIFICATION_TTL_HOURS`
- `HIRING_WORKSPACES_PER_MEMBER` / `HIRING_ACTIVE_JOBS_PER_WORKSPACE` / `HIRING_SAVED_SEARCHES_MAX` / `HIRING_CANDIDATE_LISTS_MAX` / `HIRING_CANDIDATE_LIST_ENTRIES_MAX` / `HIRING_INVITATION_TTL_HOURS`
- `DEV_WEB_PORT` (optional; `scripts/dev.ts` also accepts `-p` / `--port`)
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

Sign up normally in the UI, then promote the **owner’s registered email** (do not guess):

```bash
npm run bootstrap:admin -- you@example.com
```

This sets server-owned `staffRole=ADMIN`. Signup cannot pick admin. After promotion, **Yönetim** appears in the header for that account only.

Normal signup cannot choose `ADMIN` or a paid plan.

### 5. Bootstrap host (M2.2)

Use an existing **verified** account identity (email is never hardcoded):

```bash
npm run bootstrap:host -- host@example.com
# optional granter:
npm run bootstrap:host -- host@example.com --by admin@example.com
```

Then an admin assigns applications at `/sunucu/basvurular` or via `POST /api/admin/arayanlar`.

### 6. Optional capability seed (dev only)

```bash
npm run seed:capability -- you@example.com ai.profile.prepare
npm run seed:hiring-pilot -- you@example.com   # M3.3 promotional pilot grants
```

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run live:verify:m22   # requires OPENAI_API_KEY + AI_PROVIDER=openai
npm run cleanup:fixtures         # dry-run: report local verify fixtures only
npm run cleanup:fixtures:apply   # delete only unequivocal local fixtures
```

`cleanup:fixtures` refuses non-local databases and never truncates ledgers or episode/RSS data.

## Product UI language

Member-facing UI is Turkish. Engineering docs and code identifiers are English.

## Docs

- [Product](docs/product.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Credits ledger](docs/credits.md)
- [Arayanlar preparation](docs/arayanlar.md)
- [Messaging](docs/messaging.md)
- [Community (Q&A, invitations, FAQs, episodes)](docs/community.md)
- [Hiring (employer workspaces, jobs, discovery)](docs/hiring.md)
- [Podcast episodes & RSS import](docs/episodes.md)
- [Catchylabs integration](docs/catchylabs-integration.md)
- [Build brief](PodTest_Network_Cursor_Build_Brief.md)
