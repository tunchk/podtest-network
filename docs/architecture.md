# Architecture

Modular monolith (logical boundaries, single Next.js app):

| Area | Location |
|---|---|
| Identity / sessions | `src/lib/auth.ts`, `src/app/api/auth/[...all]` |
| Profiles / publication | `src/lib/profiles/*`, `src/app/hesabim/profil`, `src/app/u/[slug]` |
| Directory | `src/app/uyeler` |
| Moderation (manual + assistive) | `PublicationReview`, `AutomatedContentReview`, `/yonetim` |
| Private CV storage | `storage/private/**`, `src/lib/cv/*`, `/api/cv` |
| AI jobs | `src/lib/ai/*`, `/api/ai/profile-prepare`, `scripts/ai-worker.ts` |
| Credits ledger | `src/lib/credits/ledger.ts` |
| Entitlements | `src/lib/capabilities/*` |
| Catchylabs boundary | `src/lib/integrations/catchylabs.ts` |

## Authorization rules

- Session identity comes from Better Auth cookies. Request body `userId` is never trusted as authentication.
- Profile mutations and CV/job access are scoped to `session.user.id`.
- Owner preview (`getOwnerDraftPreviewBySlug`) requires matching owner; `?onizleme=1` alone is insufficient.
- Public reads use `published && publicationStatus === APPROVED && publicSnapshot`.
- Pending review snapshots and draft edits never become `publicSnapshot` until human approval of that revision.
- Applying AI suggestions updates private draft only.
- Capability evaluation denies unknown keys.
- Credit ledger operations are server-side and idempotent per job.

## AI worker

- `npm run dev` runs Next.js and `scripts/ai-worker.ts` via concurrently.
- `npm run worker` / `npm run worker:once` for dedicated processes.
- Worker loads `.env` then `.env.local` through `loadAppEnvironment()` — the same files intended for the app. Vitest stub overrides live only in `tests/setup.ts` and do not belong in `.env.local`.
- Jobs use lease-based claiming (`FOR UPDATE SKIP LOCKED`) with crash recovery.
- Production (`NODE_ENV=production`) never executes stubs, even if `AI_ALLOW_STUB`, `AI_DEMO_STUB`, or `AI_PROVIDER=stub` are set.

## Automated publication review

- M2.1 adapter is **rule-based heuristic assistance** (`rule-based-heuristic`), not an OpenAI moderation product.
- Results are revision/snapshot-bound; human approval remains mandatory.
- Unavailable / failed assist is never treated as a safe verdict.

## Private CV retention

- Files live under `storage/private/cvs` and extracted text under `storage/private/job-inputs`.
- Soft-delete removes files; failed/settled jobs do not keep text in logs.
- Limits: 5 MB upload, 50k extracted characters (see `CV_RETENTION`).
- Raw CV text and secrets must never be logged.

## Data stores

- PostgreSQL: `podtest` (app), `podtest_test` (tests)
- Prisma 7 + `@prisma/adapter-pg`
- Migrations under `prisma/migrations`
