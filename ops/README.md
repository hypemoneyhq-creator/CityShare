# CityShare ops dashboard

Step 9 of the build order: the ops dashboard. Recreated from `CityShare
Operations.dc.html` — a 1440px desktop layout, a different platform from
the Expo rider/driver/Partner app, so it's its own workspace: Vite +
React + TypeScript, no framework dependency beyond that.

## Stack

Vite, React, TypeScript. No UI kit — the design's dark-sidebar/light-content
layout is plain CSS (`src/theme.css`) sharing the same palette as
`mobile/src/theme/tokens.ts`, so the three surfaces (rider, driver, ops)
read as one product.

## Running

```
npm install
npm run dev
```

Point `src/api/config.ts` (or `VITE_API_BASE_URL`) at your backend —
defaults to `localhost:4000`. Start the backend first and run its `npm
run seed`.

## Login

There's no separate ops login system — it's the same phone+OTP flow
every CityShare user goes through. What's different is what happens
after verifying: an account without `isOps` sees a plain "not an ops
account" screen instead of the dashboard. Ops accounts are provisioned
directly in the database (no self-service "become-ops," unlike
Partner/driver mode in the rider app — see backend README), so to try
this locally, verify a phone number once and flip `isOps` on that user
directly:

Run this from `backend/`, after verifying the phone number once through the login screen:

```
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.update({ where: { phone: '+233...' }, data: { isOps: true } }).then(() => p.\$disconnect());
"
```

## Tabs

| Tab | Backed by |
|---|---|
| Live ops | `GET /api/ops/summary` |
| Escrow & disputes | `GET /api/ops/disputes`, `POST /api/bookings/:id/resolve-dispute` |
| Corridors & stops | `GET /api/ops/corridors` |

## Fidelity adaptations (and why)

The design's "Live ops" stat row also shows network-wide "active
Partners" and "unfulfilled searches," and a multi-corridor demand chart
built from logged searches. This build has no search log (nothing
records an unanswered `GET /api/corridors` query) and only one seeded
corridor, so those are replaced with what's real: today's actual escrow
position, run status, on-time departure rate (computed from
`RunStopEvent` vs. each stop's scheduled time) and seat utilization, and
a corridor capacity table showing Express seats scheduled vs. Partner
seats listed — supply, not demand, since there's nothing to compute
unfulfilled demand from.

The "Express Operator scorecard" (ratings, on-time/load per operator,
suspend-per-corridor) is dropped entirely rather than faked — there is no
Operator entity yet (Express Operator certification is step 10); every
"driver" and "Partner" in this build is a `User` flag standing in for it.
The design's per-case "CODE USED/UNUSED" dispute chip is dropped for the
same reason: boarding is decided entirely by GPS-verified two-sided taps
(spec section 4), and the boarding code is never actually checked against
anything, so that chip would be fabricated. What's shown instead is real:
which side raised the case and whether GPS was present/consistent.

The design's K03 "proposed service" card (reasoned from a 100-unfulfilled-
search threshold) and its departure-slot histogram with a dashed
"unfulfilled" overlay are both omitted for the same reason — no search
log to compute either from.

## Not built yet

Everything gated on data or roles this build doesn't have: Operator
management, a corridor/service editor (the corridors tab is read-only —
schedule changes are still made through `prisma/seed.ts` or a migration),
and any historical/multi-day view (all figures here are "today").
