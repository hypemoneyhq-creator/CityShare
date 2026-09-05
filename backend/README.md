# CityShare backend

Steps 1-6 of the build order from the design handoff: identity & phone
verification, the corridor -> service -> stop -> run data model, seat
inventory including per-segment Express Stops, the escrow ledger and
state machine, the API surface the mobile app's booking flow is built
against, and GPS-verified two-sided boarding with an offline tap queue.

## Stack

Node.js, TypeScript, Express, PostgreSQL via Prisma. No SMS or NIA/Ghana
Card provider is wired up (see root README "Blockers"); phone verification
returns the OTP code directly in non-production responses so the mobile
client and tests can drive the flow without a real carrier, and Ghana
Card + selfie verification is mocked as an instant match.

## Running locally

```
cp .env.example .env   # point DATABASE_URL at a local Postgres
npm install
npm run prisma:migrate
npm run seed
npm run dev
```

The server listens on `PORT` (default 4000).

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/phone/start` | — | Send (mock) SMS OTP to a phone number |
| POST | `/api/auth/phone/verify` | — | Verify the OTP, upsert the user, issue a session token |
| POST | `/api/auth/identity` | Bearer | Submit Ghana Card number + selfie (mock match) |
| GET | `/api/auth/me` | Bearer | Current user + verification status |
| POST | `/api/auth/become-partner` | Bearer | Stand-in for Partner onboarding (not built yet) |
| GET | `/api/corridors` | — | List corridors with their active services |
| GET | `/api/services/:id` | — | One service with its ordered stop profiles |
| GET | `/api/services/:id/runs?date=YYYY-MM-DD` | — | Runs for a service |
| GET | `/api/runs/:id/segments` | — | Stops + per-leg seat availability + leg fares + service info for a run |
| POST | `/api/runs/:id/holds` | Bearer, verified | Hold seats on a run for a board/alight stop pair |
| POST | `/api/holds/:id/release` | Bearer | Release a run seat hold before it expires |
| POST | `/api/partner-trips` | Bearer, verified, Partner | Create a Partner trip listing |
| GET | `/api/partner-trips?corridorId=` | — | List scheduled Partner trips with available seats |
| POST | `/api/partner-trips/:id/holds` | Bearer, verified | Hold seats on a Partner trip |
| POST | `/api/partner-holds/:id/release` | Bearer | Release a Partner trip seat hold |
| POST | `/api/holds/:id/pay` | Bearer, verified | Pay for a run hold (mock MoMo prompt) — creates the Booking + Escrow |
| POST | `/api/partner-holds/:id/pay` | Bearer, verified | Same, for a Partner trip hold |
| GET | `/api/bookings/:id` | Bearer (owner or ops) | Booking + escrow state; advances PENDING/REFUNDING if the mock payment has resolved |
| GET | `/api/bookings` | Bearer | The caller's own bookings |
| POST | `/api/bookings/:id/board/driver` | Bearer | Driver-side boarding tap: `{lat?, lng?, clientTimestamp?}`, HELD only |
| POST | `/api/bookings/:id/board/rider` | Bearer, rider only | Rider-side boarding tap; both taps -> RELEASABLE (if GPS matches) or DISPUTED |
| POST | `/api/bookings/:id/deny-boarding` | Bearer | Driver-side "this passenger did not board" -> DISPUTED |
| POST | `/api/bookings/:id/dispute` | Bearer, rider only | "I did not board" -> DISPUTED |
| POST | `/api/bookings/:id/location-pings` | Bearer, rider only | Append a GPS point to the rider's trip-window trail |
| GET | `/api/bookings/:id/location-pings` | Bearer (owner or ops) | The rider's location trail, for dispute review |
| POST | `/api/bookings/:id/resolve-dispute` | Bearer, ops | DISPUTED -> RELEASABLE or REFUNDING |
| POST | `/api/bookings/:id/mark-no-show` | Bearer, ops | HELD -> FORFEIT |
| POST | `/api/bookings/:id/settle` | Bearer, ops | RELEASABLE/FORFEIT -> SETTLED (pays out for a Partner booking) |
| GET | `/api/runs/:id/manifest` | — | Paid passengers on a run (driver app data; no driver auth yet) |
| GET | `/api/ops/stale-boardings?minutes=` | Bearer, ops | HELD bookings the driver boarded but the rider never confirmed |

## Data model

`Corridor` -> `Service` (DIRECT or STOPS) -> `StopProfile` (ordered,
board/alight rules, max dwell, per-leg fare) -> `Run` (a dated instance,
with a seat `capacity`). See `prisma/schema.prisma` for the full shape and
`prisma/seed.ts` for the Western corridor (Kasoa -> Circle, K01 direct /
K02 stops, plus one Partner trip) used by the design prototypes.

### Seat inventory (spec section 2)

A seat is the unit of inventory, not a trip. Express Stops sells per leg:
a `SeatHold` spans every leg between its board and alight stop, and a
leg's availability is `run.capacity` minus the seats of every hold whose
range covers that leg — see `computeLegAvailability` in
`src/services/inventory.ts`. This is what lets a Kasoa->Kaneshie booking
and a Mallam->Circle booking both succeed even though they overlap on the
Mallam->Kaneshie leg, while correctly contending for that shared leg's
capacity.

Holds are `PENDING` for 5 minutes from creation (spec: "seats are held
for 5 minutes from payment initiation" — the actual payment step is step
5; this lays the inventory groundwork for it), then lazily reaped to
`EXPIRED` the next time availability is computed. There's no background
sweep yet, and the availability check + hold creation only run inside a
`$transaction` at default (read-committed) isolation — a real concurrency
hardening pass should add row locking before this sees production
traffic.

Partner trips are single-leg (a Partner lists 1-4 of their own seats), so
they use a simpler `PartnerSeatHold` against `PartnerTrip.seatsTotal`
directly rather than the leg-availability machinery above.

One published fare per seat (spec section 2): DIRECT services quote a
flat fare (`Service.flatFareCedis`); STOPS services quote per leg
(`StopProfile.legFareCedis`, summed over the booked range) — see
`computeRunFare`. It's locked onto the `SeatHold`/`PartnerSeatHold` at
creation (`fareCedis`) so the amount actually charged can never drift
from what the rider was quoted.

### Escrow ledger and state machine (spec section 3)

`src/services/escrow.ts` holds the transition table transcribed straight
from the spec (`PENDING -> HELD/VOID`, `HELD -> RELEASABLE/REFUNDING/
DISPUTED/FORFEIT`, etc.) and enforces its one hard invariant: **DISPUTED
is terminal until a human resolves it** — `transitionEscrow` rejects any
exit from DISPUTED whose actor isn't OPS. Every transition — allowed or
not — that does go through is written to `EscrowLedgerEntry`
(`fromState`, `toState`, actor, evidence, timestamp) in the same
transaction as the state change, and that table is append-only; nothing
in this codebase updates or deletes a row in it. Escrow state is CityShare's
own — it is never inferred from the payment provider's balance.

`src/services/paymentProvider.ts` mocks the five-function interface from
the root README ("Building the money path before MoMo is signed"):
`initiateCollection` / `getCollectionStatus` / `refund` / `payout` /
`getBalance`. It resolves lazily — the eventual outcome is decided at
creation and only "revealed" once its `resolvesAt` passes, so callers
just poll instead of needing a webhook. Test control (no real network to
drive from): a rider phone ending `0000` gets a mock `DECLINED`, `9999`
gets `TIMEOUT` at exactly 90s, anything else is `APPROVED` after a
3-8s delay — or pass `forceOutcome` directly in the `/pay` request body.
`getBalance` is a stub (`{ available: 0, held: 0 }`) — there's no
per-account earnings ledger yet (that's the Operator/Partner payout
ledger, steps 9-10).

`src/services/booking.ts` is the orchestration layer that ties a paid
hold to a `Booking` + `Escrow`, and holds the two remaining pieces the
spec calls out explicitly:

- **Boarding is two-sided.** `tapBoarded` only fires once both
  `driverBoardedAt` and `riderBoardedAt` are set — one tap alone changes
  nothing.
- **FORFEIT's payout amount is explicitly unresolved** (spec: "OPEN —
  whether FORFEIT on no-show pays the driver in full, partially, or not
  at all"). `settleBooking` takes `payoutAmountCedis` as a required
  caller-supplied number rather than deciding a policy — this code
  doesn't invent the answer, it just gives ops a mechanism to apply
  whatever the answer turns out to be.

Driver identity doesn't exist yet (Express drivers are employed by an
Operator — step 8), so the driver-side boarding tap accepts any
authenticated caller for a Run booking; a Partner booking's tap is
properly restricted to that trip's Partner, since that identity is real.
Ops identity is similarly a stub — `User.isOps`, set directly, standing
in for the access control the ops dashboard (step 9) will actually own.

### Boarding verification and offline queueing (spec section 4)

Once both taps land, `tapBoarded` checks GPS before deciding the outcome
— it does not just release on two taps. Each tap's coordinates are
checked against the pickup point's stored coordinates (`StopProfile`
for a Run, `PartnerTrip.origin*` for a Partner trip) with a 300m
tolerance (`PICKUP_GPS_TOLERANCE_METERS` in `src/services/geo.ts`, a
deliberately generous allowance for toll-booth-sized pickup points and
ordinary phone GPS error — not a spec'd number). Only when both taps are
present *and within range* does escrow move to RELEASABLE; if GPS is
missing on either tap or either is outside the tolerance, it moves to
DISPUTED instead, for ops to review — this is the spec's "must not
default to either party," implemented as: don't guess, escalate.

The same DISPUTED state also covers the driver's side of "conflict
handling": `denyBoarding` lets a driver report a passenger who didn't
show, symmetric to the rider's `openDispute` (spec: "driver taps and
rider denies, or rider taps and driver denies"). Both land in the exact
same ops queue as a GPS mismatch — `resolveDispute` from step 4 handles
all three origins identically, and the ledger evidence records which one
it was.

**Offline queueing**: every boarding-tap and location-ping endpoint
accepts an optional `clientTimestamp`. When present, it — not the
server's receipt time — is what gets stored as `driverBoardedAt`,
`riderBoardedAt`, or a `LocationPing.recordedAt`. A driver app can queue
taps made with no signal and submit them once reconnected; the recorded
time is still the moment of the tap, never the sync (spec section 11).
There's no actual local queue here (that's the driver app's job, step 8)
— this is the server-side half of the contract: idempotent-enough
(re-tapping the same side just overwrites with the same values) and
indifferent to how late a tap arrives.

**Not built here**: dwell-duration tracking (that's the driver app's
live countdown, step 8) and any UI at all for the manifest or location
trail — `GET /runs/:id/manifest` and the stale-boardings query are the
data those future screens will read.
