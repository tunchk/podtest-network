# Architecture

Modular monolith (logical boundaries, single Next.js app):

| Area | Location |
|---|---|
| Identity / sessions | `src/lib/auth.ts`, `src/app/api/auth/[...all]` |
| Profiles / publication | `src/lib/profiles/*`, `src/app/hesabim/profil`, `src/app/u/[slug]` |
| Directory | `src/app/uyeler` |
| Moderation (manual + assistive) | `PublicationReview`, `AutomatedContentReview`, `/yonetim` |
| Private CV storage | `storage/private/**`, `src/lib/cv/*`, `/api/cv` |
| In-app notifications | `InAppNotification`, `/bildirimler`, `/api/bildirimler` |
| AI jobs | `src/lib/ai/*`, `/api/ai/profile-prepare`, `scripts/ai-worker.ts` |
| Arayanlar preparation | `src/lib/arayanlar/*`, `/arayanlar`, `/sunucu/basvurular` |
| Messaging | `src/lib/messaging/*`, `/mesajlar`, `/api/mesajlar/*` |
| Community Q&A / invitations / FAQs / episodes | `src/lib/community/*`, `/topluluk`, `/bolumler`, `/davet/konusmaci`, `/api/topluluk/*`, `/api/davet/*`, `/api/bolumler`, `/api/uzman` |
| Hiring (employer workspaces, jobs, discovery) | `src/lib/hiring/*`, `/is-ilanlari`, `/isveren/*`, `/davet/isveren`, `/api/isveren/*`, `/api/is-ilanlari` |
| Podcast RSS import | `src/lib/podcast/*`, `/api/admin/podcast-rss`, admin panel on `/yonetim` |
| Email verification (local mail-sink) | `src/lib/auth/email-verification.ts`, `/hesabim/eposta-dogrula` |
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
- Host access requires server-owned `HostAuthorization` **and** per-application assignment. Paid plans / HIRING never grant host access.
- Guest APIs and pages never return host-pack fields (including nested job payloads).
- Messaging: membership and blocks are enforced server-side; client participant IDs are never trusted.
- Moderation staff roles (`ADMIN`/`MODERATOR`) are required for report queues — host authorization alone is insufficient.
- Community Q&A reuses messaging blocks + report queue; speaker invitations are ADMIN-only and never grant staff/host privileges.
- Email verification tokens are hashed; `emailVerified` is never set from a client claim.
- Episode selectors and public APIs omit non-`PUBLISHED` episodes; appearance `adminVerifiedAt` is only set by admin paths.
- Employer: every mutation validates workspace membership server-side; capabilities gate pilot actions separately from membership. Job listings reuse revision-bound moderation; active published job slots are enforced with advisory locks. Hiring notes and saved searches are workspace-scoped; message outreach reuses messaging quotas and blocks.
- Staff navigation (`Yönetim`) is shown only when `staffRole` is `ADMIN` or `MODERATOR`. Grant with `npm run bootstrap:admin -- <registered-email>`.
- CV PDF extraction uses `pdf-parse` / `pdfjs-dist` as `serverExternalPackages` so Turbopack does not break the worker; storage keys are server-generated UUIDs (client filenames are metadata only).

## AI worker

- `npm run dev` runs Next.js and `scripts/ai-worker.ts` via `scripts/dev.ts` (handles `-p` / `--port` without leaking stray args into concurrently).
- `npm run worker` / `npm run worker:once` for dedicated processes.
- Worker loads `.env` then `.env.local` through `loadAppEnvironment()` — the same files intended for the app. Vitest stub overrides live only in `tests/setup.ts` and do not belong in `.env.local`.
- Jobs use lease-based claiming (`FOR UPDATE SKIP LOCKED`) with crash recovery.
- `ARAYANLAR_PREPARE` completes atomically only when both guest brief and host pack validate and persist.
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
