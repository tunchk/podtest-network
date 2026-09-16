# Community Q&A, invitations, FAQs, and podcast episodes (M3.2)

## Honest moderation label

Community content uses the **same rule-based heuristic** as messaging (`rule-based-heuristic`, policy `m3.2-community-rule-v1`). It is **not** an AI moderation product.

| Classification | Behavior |
|---|---|
| clear | Ordinary allowed content may publish without mandatory human approval |
| hold (ambiguous) | Content is held; pending edits do **not** replace a previously published revision |
| reject | Clear violations are rejected |
| unavailable | Must **not** silently publish — treated as hold |

Reports reuse `ContentReport` / `ModerationCase` / `ModerationHold` with target types `COMMUNITY_QUESTION`, `COMMUNITY_ANSWER`, `EXPERT_FAQ`. Podcast hosts are **not** automatic moderators. Staff roles `ADMIN` / `MODERATOR` only.

## Q&A lifecycle

- Routes: `/topluluk`, `/topluluk/sorular/[id]`, `/topluluk/sor`
- Reading published Q&A is public. Writing requires authentication.
- CV, interests, public profile, or paid plan are **not** required to ask or answer.
- Private drafts (`DRAFT`) never appear in public lists/detail/API.
- Before first publish, UI requires acknowledging that content + display name become public even if the profile is unpublished. Email and private profile fields are never exposed.
- Owner removal / moderator removal hide content from public surfaces. Removing a question hides its public answer thread.
- Plain text + safe `http(s)` link rendering only. No HTML, attachments, nested threads, or voting.
- Blocks: a blocked pair cannot answer each other's questions or send targeted expert questions. Public posts remain visible to anonymous viewers.

### Anti-abuse limits (configurable env; not commercial promises)

| Limit | Env | Default |
|---|---|---|
| Question title | `COMMUNITY_QUESTION_TITLE_MAX` | 160 |
| Question body | `COMMUNITY_QUESTION_BODY_MAX` | 5000 |
| Answer body | `COMMUNITY_ANSWER_BODY_MAX` | 5000 |
| Questions / member / UTC day | `COMMUNITY_QUESTIONS_PER_DAY` | 5 |
| Answers / member / UTC day | `COMMUNITY_ANSWERS_PER_DAY` | 20 |

Daily quotas use `pg_advisory_xact_lock` for concurrency-safe enforcement and idempotency keys on submit.

## Speaker invitations

- Admin-only create/revoke/inspect at `/yonetim` (ADMIN).
- Cryptographically random, expiring, single-use tokens. **Only SHA-256 hashes** stored.
- Plaintext returned once for link copy (`/davet/konusmaci?token=…`). No real invitation emails are sent.
- Optional recipient email binding: acceptance requires an authenticated account with that email **and** `emailVerified=true` from the secure verification flow (not a client claim).
- Email verification: `/hesabim/eposta-dogrula` + local **mail-sink** under `storage/mail-sink/` (gitignored). No outbound mail in this milestone.
- Acceptance is atomic (`FOR UPDATE`) and idempotent for the same consumer.
- Rejected: expired, revoked, previously consumed, wrong-account.
- Grants `profile.speakerParticipation` and/or confirmed episode association only — **never** staff, moderator, host-workspace, employer, or paid-plan privileges. Distinct from professional qualification verification.

## Expert FAQs

- Optional expert settings on profile: discussion areas, accept targeted questions, consultation URL (validated), paid disclosure, show appearances.
- Expert creates FAQ drafts; admin may propose drafts that stay unpublished until the attributed expert approves **that exact revision**.
- Editing approved FAQ text clears expert approval; moderation approval and expert attribution approval are separate.
- No AI answer generation on an expert's behalf.
- Targeted questions: optional in-app notification; rate-limited; block/contact rules apply. Not a service promise.

## Podcast episodes and appearances

- Admin-managed catalog: series, title, description, publication date, canonical listening URL, publication state (`DRAFT` / `PUBLISHED` / `REMOVED`).
- Public `/bolumler` and selectors only show `PUBLISHED` episodes. Draft/removed must not leak.
- Member requests association → admin verifies. Admin may propose → member accepts. Members cannot self-verify by editing payloads.
- Only confirmed associations on published episodes appear on public profiles when the member opts in (`showAppearancesOnProfile`) and the profile is published.
- Questions may optionally link to a published episode.

## Retention

Removed Q&A/FAQ rows remain in the database for moderation/audit with `REMOVED_*` status; public APIs omit them. Full account deletion retention policy remains as documented for later launch hardening.

## APIs (authenticated unless noted)

| Path | Notes |
|---|---|
| `GET/POST /api/topluluk/sorular` | Public list/detail GET; write POST |
| `POST /api/topluluk/cevaplar` | Answers |
| `POST /api/topluluk/rapor` | Reports |
| `GET/POST /api/davet/konusmaci` | Invitations |
| `POST /api/hesabim/eposta-dogrula` | Local verification |
| `GET/POST /api/bolumler` | Episodes / appearances |
| `GET/POST /api/uzman` | Expert settings / FAQs / targeted |
| `GET/POST /api/moderasyon` | Staff queue (existing) |
