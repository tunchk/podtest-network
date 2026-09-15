# Roadmap

Source of truth for sequencing: `PodTest_Network_Cursor_Build_Brief.md`.

| Stage | Focus | Status |
|---|---|---|
| **M1** | Accounts, onboarding, profiles, directory, manual publication moderation, capability catalog, Catchylabs boundary | Done |
| **M2.1** | CV-assisted profile suggestions, durable AI worker, sponsored credit ledger, assistive automated content review | Done (this codebase) |
| **M2.2** | Optional Arayanlar preparation, member confirmation of submitted facts, separate guest/host artifacts, assigned-host authorization, 18-minute editorial format | **Next** |
| **M3** | Message requests, block/report, Q&A, expert invitations, discovery | Planned |
| **M4** | PodTest+/Employer subscriptions, top-ups, purchases | Planned |
| **M5** | Catchy linked accounts and bounded Plus benefit pilot | Planned |
| **M6** | Webinars, expanded expert features, evidence sharing | Planned |

## Next concrete task — Milestone 2.2

Implement optional **PodTest Arayanlar** preparation:

1. Applicants-only flow reusing profile/CV facts with at most 4–5 short questions.
2. Generate **two separate artifacts**:
   - Guest brief (format, story topic, preparation guidance, contact summary, checklist)
   - Host pack (factual summary with source labels, questions, case, rapid round, timing)
3. Guest confirms facts to submit; **host packs are created/stored server-side for assigned hosts only** and must **never** be included in guest API payloads.
4. Preserve the 18-minute editorial timeline from the product brief.
5. AI job states, sponsored/host cost separation, and no invented professional qualities.

Do not implement messaging, payments, subscriptions, social feed, or Catchylabs live integration in M2.2.
