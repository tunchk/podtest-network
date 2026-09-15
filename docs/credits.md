# Credits ledger (Milestone 2.1 + 2.2)

## Operations

`GRANT → RESERVE → SETTLE | RELEASE`

### Profile prepare (M2.1)

- **Sponsored profile prepare**: idempotent lot key `sponsored:ai.profile.prepare:v1:{userId}`.
- Job creation snapshots `creditCostSnapshot` and reserves atomically.
- Success settles once (`settle:{jobId}`); failure/cancel releases once (`release:{jobId}`).

### Arayanlar prepare (M2.2)

- **Sponsored Arayanlar prepare** (separate grant): `sponsored:ai.arayanlar.prepare:v1:{userId}`.
- Env: `ARAYANLAR_PREPARE_CREDIT_COST`, `SPONSORED_ARAYANLAR_PREPARE_AMOUNT`.
- **Grant** is issued when the member confirms cost / starts preparation (`confirm_cost`). Resuming does not duplicate the grant.
- **Reservation begins on explicit submit** of confirmed facts (creates `ARAYANLAR_PREPARE` job), not per chat message.
- **Settlement** when both guest brief and host pack are validated and persisted atomically and the job is `READY`.
- **Release** on withdraw, cancel, max-attempt failure, or abandoned in-flight jobs. Draft-only abandonment (no submit) never reserved credits.
- Host pack edits / regeneration use **platform allocation** (`creditCostSnapshot: 0`) with rate limits (`HOST_PACK_REGEN_MAX`, `HOST_PACK_REGEN_WINDOW_MS`) and **never** consume the guest’s credits.
- Lot source `PLATFORM_HOST_ARAYANLAR` is reserved for future explicit platform lots; pilot regen is rate-limited without drawing member lots.

## Future fit

| Lot source | Expiry | Consumption order (planned) |
|---|---|---|
| `MONTHLY` | Period end | First |
| `SPONSORED_*` | Usually none | After monthly |
| `PURCHASED` | None; survives cancellation | Last |

Moderation AI and host-pack regeneration are **platform costs** and do not draw from member credit lots for those operations.

M2.2 does **not** sell credits or activate subscriptions.
