# Catchylabs integration boundary

Status: **contract only** (Milestone 1). No live HTTP calls. Unconfigured integration reports `not_configured`.

## Ownership

| PodTest owns | Catchy owns |
|---|---|
| Community profiles, communication, podcast applications | Practice apps, test authoring, attempts |
| PodTest billing and benefit grants | Assessment evidence and execution limits |
| Linked-account records on PodTest side | Product Confidence / B2C platform data |

PodTest users must not complete Catchy testing onboarding just to join the network. PodTest must not connect directly to Catchy's database or duplicate the test runner.

## Proposed API contract (not implemented endpoints)

1. **Authenticated account link** after ownership verification (stable linked account ID). Never auto-link solely by matching unverified email.
2. **Benefit provision** — server-to-server, idempotent (`idempotencyKey`), returns pending/active/failed.
3. **Benefit revoke / expiry** — honor paid-through time; immediate revoke is a separate admin/refund policy.
4. **Access status check** — `not_configured | available | pending | failed`.
5. **Optional result sharing** — member explicitly selects evidence for PodTest profile; private attempts stay private.

## State machine (future)

`plus granted → benefit provision pending → active | failed`

Cancellation at period end → benefit expires at paid-through time. Outages show pending/unavailable — never unlimited access or invented success.

## Code entry point

`src/lib/integrations/catchylabs.ts` exports `CatchylabsIntegration` and `createCatchylabsIntegration()`. Until `CATCHYLABS_INTEGRATION_ENABLED=true` and credentials exist, all methods return `not_configured`.

## Plus benefit candidate

One eligible practice app slot (`catchy.practice_app.slots`), attempt quotas and duration TBD by owner before marketing. Author vs solver rights may need separate packages later.

Historical Catchy pointers (`catchylabs-platform-web`, `catchyapp-backend`, confidence branches) are not inspected or modified by this repository.
