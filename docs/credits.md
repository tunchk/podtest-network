# Credits ledger (Milestone 2.1)

## Operations

`GRANT → RESERVE → SETTLE | RELEASE`

- **Sponsored profile prepare**: idempotent lot key `sponsored:ai.profile.prepare:v1:{userId}`.
- Job creation snapshots `creditCostSnapshot` and reserves atomically.
- Success settles once (`settle:{jobId}`); failure/cancel releases once (`release:{jobId}`).
- Transient retries keep the same reservation when still held.
- Cancelled jobs release credits; late provider/worker results must not settle or publish.

## Future fit

| Lot source | Expiry | Consumption order (planned) |
|---|---|---|
| `MONTHLY` | Period end | First |
| `SPONSORED_*` | Usually none | After monthly |
| `PURCHASED` | None; survives cancellation | Last |

Moderation AI is a **platform cost** and never draws from member credit lots.

M2.1 does **not** sell credits or activate subscriptions.
