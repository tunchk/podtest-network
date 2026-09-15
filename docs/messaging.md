# Messaging (Milestone 3.1)

## Lifecycle

1. Discover a **published, approved, discoverable** member.
2. Send a **message request** with a plain-text introduction (≤ 1,000 chars).
3. Recipient **accepts**, **rejects**, **blocks**, or **reports**.
4. Acceptance creates or returns the single unordered-pair **conversation**.
5. Participants exchange plain-text messages (≤ 4,000 chars) via polling UI.

States for requests: `PENDING` → `ACCEPTED` | `REJECTED` | `CANCELLED`.

Disabling “accept new requests” does not close accepted conversations; existing pending requests remain actionable.

## Quotas

- Capability: `network.message_request.create` (FREE baseline via central evaluator).
- Development default: **5 successfully created requests per UTC calendar month** (`MESSAGE_REQUEST_FREE_MONTHLY_ALLOWANCE`).
- PLUS/EMPLOYER monthly hints are configured for later billing (`MESSAGE_REQUEST_PLUS_MONTHLY_ALLOWANCE`, `MESSAGE_REQUEST_EMPLOYER_MONTHLY_ALLOWANCE`) — checkout is out of scope.
- Atomic consumption with sender-scoped idempotency keys. Rejected/cancelled requests do **not** refund. Failed/blocked/moderated-out creations do **not** consume.
- Held (pre-approval) requests consume quota only when a moderator **releases** them into `PENDING`.

## Cooldown

Configurable pair-level cooldown after reject or sender cancel (`MESSAGE_REQUEST_COOLDOWN_DAYS`, default 7). **Blocking takes precedence** over cooldown and quota.

## Blocking

Either member may block. Effects:

- No new requests either direction
- Pending requests cancelled
- Existing conversation messaging paused (`PAUSED`)
- History retained for participants

Unblocking does **not** restore cancelled requests or auto-resume messaging. Resume requires a new resumption request + acceptance (same quota/cooldown/idempotency rules).

## Moderation

Rule-based classifier (`rule-based-heuristic`) — **not** an AI product.

| Outcome | Behavior |
|---|---|
| Clear | Deliver |
| Clear violation | Reject before delivery |
| Ambiguous / unavailable | Hold; invisible to recipient; no unread/preview |
| Release | Recheck block, membership, prefs, quota |

Reports: request, authorized message, or published profile. Staff (`ADMIN`/`MODERATOR`) only — **host authorization alone is insufficient**.

Removals show a neutral placeholder to participants; evidence remains for review.

## Privacy

- Account email and private draft fields are never exposed via messaging payloads.
- Unpublished members are not discoverable for new requests; conversation peers may still see minimal identity + history.
- Do not log message bodies, CVs, or secrets.

## Retention

Conversation history is retained for participants after blocks and unpublication. Previously downloaded material cannot be recalled. Moderated evidence snapshots are minimal and access-logged.
