# Hiring — employer workspaces (M3.3)

## Product decision

**PodTest+ is coming soon.** Monetization infrastructure (capability catalog, grants) remains prepared, but subscriptions, checkout, and credit sales are **not** implemented in this milestone.

Employer features run on a **named free pilot** (`provenance: hiring_pilot_v1`, `CapabilitySource.PROMOTIONAL`). Pilot grants are **not** paid EMPLOYER subscriptions and must not be labeled as such in UI.

## Workspace roles vs capabilities

| Layer | Purpose |
|---|---|
| **Capability grants** | Gate whether a user may create workspaces, publish jobs, run advanced search, save searches, manage lists |
| **Workspace membership** | Gates access to a specific workspace’s jobs, searches, lists, and notes |

An entitlement alone never grants access to another workspace’s private data.

Roles:

- **OWNER** — settings, members, jobs, candidate data; cannot be removed by recruiters
- **RECRUITER** — jobs, search, lists, notes within the workspace; cannot grant OWNER

`profile.hiring` is a member-controlled status only — it does **not** grant workspace access.

Speaker invitations, host authorization, and staff roles do **not** grant employer workspace access.

## Pilot limits (env-configurable; not commercial promises)

| Variable | Default |
|---|---|
| `HIRING_WORKSPACES_PER_MEMBER` | 1 |
| `HIRING_ACTIVE_JOBS_PER_WORKSPACE` | 1 |
| `HIRING_SAVED_SEARCHES_MAX` | 20 |
| `HIRING_CANDIDATE_LISTS_MAX` | 20 |
| `HIRING_CANDIDATE_LIST_ENTRIES_MAX` | 200 |

Active job slot enforcement uses `pg_advisory_xact_lock` per workspace. When the limit is reached, the API returns `ACTIVE_JOB_LIMIT` — **no upgrade sales flow**.

## Job lifecycle

`DRAFT` → submit → rule-based classification → `PUBLISHED` / `PENDING_REVIEW` / `REJECTED`

Pending edits do not replace an approved public revision (same pattern as community Q&A).

Public listings: `PUBLISHED` and not past `closingDate`. `CLOSED` / `REMOVED` disable application immediately.

Application methods:

- **EXTERNAL_URL** — validated https URL only
- **MESSAGING** — contact must be an active workspace member; publish fails if contact unavailable

No ATS, no application CV upload.

## Discovery

Search uses only **approved, published, discoverable** profile fields (public allowlist via `publicSnapshot`).

Supported filters: skills, open-to-work, open-to-projects, location, work preferences, text on headline/bio/work preferences.

No protected-attribute filters, no AI suitability scores, deterministic ordering (`approvedAt desc`, `slug asc`).

## Saved searches and candidate lists

Saved searches store **filter JSON**, not profile copies.

List entries reference `subjectUserId`; on load, visibility is re-evaluated — unavailable entries omit professional details.

Notes are plain text, workspace-scoped, with author and timestamps. Never exposed on member profiles or to other workspaces.

## Messaging boundary

Outreach uses existing `createMessageRequest`:

- Sender = initiating recruiter (their quota applies)
- Workspace name may appear in introduction text only
- Colleagues cannot read each other’s conversations via workspace membership

Blocks, contact preferences, cooldowns, and restrictions apply unchanged.

## Invitations

Separate from speaker invitations (`employer_membership_invitation`). Token hashes only; accept at `/davet/isveren`. No real email sends.

## Downgrade behavior

Revoking pilot capabilities prevents **new** restricted actions. Existing workspace rows, jobs, lists, and notes remain in the database but are inaccessible without grants + membership.

## Setup

```bash
npm run db:migrate:deploy
npx tsx --env-file=.env.local scripts/seed-hiring-pilot.ts you@example.com
```

Creating a workspace also calls `ensureHiringPilotGrants` for the owner (idempotent).

## Routes

| Public | Employer (auth) |
|---|---|
| `/is-ilanlari`, `/is-ilanlari/[slug]` | `/isveren`, `/isveren/ilanlar`, `/isveren/adaylar`, `/isveren/aramalar` |

API: `/api/isveren`, `/api/isveren/[workspaceId]/*`, `/api/is-ilanlari`, `/api/davet/isveren`
