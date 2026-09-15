# Product

PodTest Network is an open community. Anyone can join. Membership does not require applications, interviews, CVs, interest taxonomies, or testing missions.

## Milestone 1 behavior

- Email/password accounts with server sessions (Better Auth). Logout revokes the session cookie via Better Auth sign-out.
- Optional onboarding at `/hos-geldin` with **Şimdilik geç**.
- Editable profiles at `/hesabim/profil` including display name, slug, headline, bio, skills, interests, experience, education, projects, languages, location, work preferences, public links, and independent statuses: open to work / hiring / open to projects.
- Default profile is a private draft. Visibility is explained in plain Turkish on the profile page.
- Publication requires manual review (`PENDING_REVIEW` → moderator approve/reject). Approved public snapshots are stored separately from draft edits.
- Public profile pages: `/u/[slug]` (approved + published only). Owner preview: `?onizleme=1` (owner session required).
- Directory: `/uyeler` lists published, approved, discoverable profiles with pagination and basic filters.
- Admin: `/yonetim` for staff only. Manual moderation is labeled honestly.
- Capability catalog evaluates entitlements server-side; unknown keys deny.
- Catchylabs integration interface returns `not_configured` when unconfigured.

## Milestone 2.1 behavior

- Optional CV upload (PDF/DOCX/text) or paste-text → quote credit cost → start durable AI job → review editable suggestions → apply selected fields to **private draft only**.
- Platform remains usable without AI or a CV.
- One-time sponsored credit grant (idempotent) with reserve → settle/release ledger.
- Continuously running AI worker (`npm run dev` starts web + worker).
- Assistive automated content review on publication submissions is **rule-based** (not an OpenAI moderation product); human approval remains mandatory.
- Stub AI provider runs only when explicitly enabled in non-production (`AI_DEMO_STUB` / test setup) and is clearly labeled; production cannot enable stubs.

## Explicitly not implemented yet

- Full Arayanlar preparation (guest/host packs) — see Milestone 2.2
- Messaging, blocks, reports, Q&A feed
- PodTest+ / Employer billing, credit sales, subscriptions
- Live Catchylabs provisioning

## Public field allowlist

Public and directory output expose only the profile allowlist. Account email, private CV files, raw AI chats, host notes, and private work samples are excluded.
