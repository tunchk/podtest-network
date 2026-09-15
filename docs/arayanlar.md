# Arayanlar preparation (Milestone 2.2)

## Application states (separate from AI job state)

| Status | Meaning |
|---|---|
| `DRAFT` | Optional short conversation / summary in progress |
| `AWAITING_CONFIRMATION` | Member reviews editable facts before submit |
| `SUBMITTED` | Immutable revision persisted; prep may be queued/running/ready/failed |
| `WITHDRAWN` | Ordinary host access cleared; late worker results ignored |

Prep status (`NOT_STARTED` → `QUEUED` → `RUNNING` → `READY` | `FAILED` | `CANCELLED`) tracks artifact generation only.

**Transitions (allowed):**

- create → `DRAFT`
- chat/summary complete → `AWAITING_CONFIRMATION`
- confirm submit → `SUBMITTED` + prep `QUEUED`
- withdraw from any non-terminal → `WITHDRAWN`
- after withdraw, confirm cost may reopen a fresh `DRAFT` (same row; new revision on next submit)
- post-submit “revise” returns to `DRAFT` without rewriting the prior submitted revision or packs

## Artifacts

- `GUEST_BRIEF` and `HOST_PACK` are separate typed rows bound to `submittedRevision` + `editorialTemplateVersion` (`arayanlar-18m-v1`).
- Atomic completion: both artifacts must validate before prep is `READY` and guest credits settle.
- Guest APIs/pages never return host-pack fields, prompts, or case secrets (job `resultJson` only carries readiness flags).

## Host authorization

- `HostAuthorization` is server-owned. Subscription / HIRING / client role claims never grant access.
- Per-application `assignedHostUserId`; reassignment revokes previous host on subsequent requests.
- Bootstrap: `npm run bootstrap:host -- verified@example.com` (optional `--by granter@example.com`). Email is never hardcoded.

## Retention / withdrawal

- Withdrawal cancels in-flight jobs, releases reservations, clears assignment, and blocks ordinary host reads.
- Generated rows may remain for audit; they are not exposed to hosts after withdraw.
- **Limitation:** previously downloaded copies cannot be technically recalled.

## Local commands

```bash
npx prisma migrate deploy --config prisma7.config.ts
npm run bootstrap:host -- you@example.com
npm run worker:once   # or npm run dev
npm run live:verify:m22
```

Env (optional overrides; do not commit secrets):

- `ARAYANLAR_PREPARE_CREDIT_COST`
- `SPONSORED_ARAYANLAR_PREPARE_AMOUNT`
- `HOST_PACK_REGEN_MAX`
- `HOST_PACK_REGEN_WINDOW_MS`
- `DEV_WEB_PORT` (dev script port; `npm run dev -- -p 3001` also works via `scripts/dev.ts`)
