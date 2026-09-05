# CityShare backend

Steps 1-8 of the build order from the design handoff: identity & phone
verification, the corridor -> service -> stop -> run data model, seat
inventory including per-segment Express Stops, the escrow ledger and
state machine, the API surface the mobile app's booking flow is built
against, GPS-verified two-sided boarding with an offline tap queue, the
cancellation / reassignment / no-show policy engine, and real driver
identity driving the Express run lifecycle (assignment, dwell tracking,
depart/no-show, incidents) plus Partner trip management (manifest,
no-show, earnings).

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
| POST | `/api/auth/become-driver` | Bearer | Stand-in for Express driver onboarding (not built yet) |
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
| POST | `/api/bookings/:id/board/driver` | Bearer, driver of the run or Partner of the trip | Driver-side boarding tap: `{lat?, lng?, clientTimestamp?}`, HELD only |
| POST | `/api/bookings/:id/board/rider` | Bearer, rider only | Rider-side boarding tap; both taps -> RELEASABLE (if GPS matches) or DISPUTED |
| POST | `/api/bookings/:id/deny-boarding` | Bearer, driver of the run or Partner of the trip | Driver-side "this passenger did not board" -> DISPUTED |
| POST | `/api/bookings/:id/dispute` | Bearer, rider only | "I did not board" -> DISPUTED |
| POST | `/api/bookings/:id/location-pings` | Bearer, rider only | Append a GPS point to the rider's trip-window trail |
| GET | `/api/bookings/:id/location-pings` | Bearer (owner or ops) | The rider's location trail, for dispute review |
| POST | `/api/bookings/:id/resolve-dispute` | Bearer, ops | DISPUTED -> RELEASABLE or REFUNDING |
| POST | `/api/bookings/:id/mark-no-show` | Bearer, owning Partner / assigned driver / ops | HELD -> FORFEIT |
| POST | `/api/bookings/:id/settle` | Bearer, ops | RELEASABLE/FORFEIT -> SETTLED (pays out for a Partner booking) |
| GET | `/api/runs/:id/manifest` | — | Paid passengers on a run (public, like the other read-only run endpoints) |
| GET | `/api/ops/stale-boardings?minutes=` | Bearer, ops | HELD bookings the driver boarded but the rider never confirmed |
| POST | `/api/bookings/:id/cancel` | Bearer, rider only | Rider cancellation; refund % by time-to-departure, seat always returns |
| POST | `/api/bookings/:id/reassign` | Bearer, rider only | Transfer a HELD seat to another verified rider by phone |
| POST | `/api/runs/:id/cancel` | Bearer, ops | Driver-side cancellation: full refund for every HELD booking on the run |
| POST | `/api/partner-trips/:id/cancel` | Bearer, Partner or ops | Same, for a Partner trip |
| POST | `/api/runs/:id/assign-driver` | Bearer, ops | Assign a driver to a run (sets it `ASSIGNED`) |
| GET | `/api/driver/runs` | Bearer, driver | The caller's assigned runs, each with a live `seatsSold` count |
| POST | `/api/runs/:id/start` | Bearer, assigned driver | `ASSIGNED` -> `IN_PROGRESS` |
| POST | `/api/runs/:id/stops/:stopId/arrive` | Bearer, assigned driver | Record arrival at a stop: `{clientTimestamp?}` |
| GET | `/api/runs/:id/stops/:stopId/dwell` | — | Live dwell countdown for a stop (public — useful to a future rider live-trip screen too) |
| POST | `/api/runs/:id/stops/:stopId/depart` | Bearer, assigned driver | Record departure; `{markNoShowForUnboarded}` bulk-forfeits unboarded bookings for that stop |
| POST | `/api/runs/:id/incidents` | Bearer, assigned driver | Report an incident: `{category, note?, lat?, lng?}` |
| POST | `/api/runs/:id/complete` | Bearer, assigned driver | `IN_PROGRESS` -> `COMPLETED`; returns the stop-by-stop run summary |
| GET | `/api/partner-trips/mine` | Bearer | The caller's own Partner trips, each with available seats |
| GET | `/api/partner-trips/:id/manifest` | Bearer, owning Partner or ops | Passenger list for one Partner trip |
| POST | `/api/partner-trips/:id/complete` | Bearer, owning Partner | Mark a Partner trip `COMPLETED` |
| GET | `/api/partner/earnings` | Bearer | Available/pending/held cedis + recent payouts, resolving any pending payouts first |

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

Driver identity is real as of step 8 (`User.isDriver`, a run's `driverId`)
— the driver-side boarding tap and deny-boarding are restricted to a
run's assigned driver, or a Partner booking's own Partner. A run with no
assigned driver yet still accepts any authenticated caller, for backward
compatibility with runs the ops-assignment flow hasn't touched. Ops
identity is still a stub — `User.isOps`, set directly, standing in for
the access control the ops dashboard (step 9) will actually own.

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

**Not built here**: any UI at all for the location trail — the
stale-boardings query is the data a future ops dashboard will read. The
manifest and dwell countdown now have a real UI: see the driver app
section below.

### Cancellation, reassignment, no-show (spec section 5)

`src/services/cancellationPolicy.ts` holds the refund ladder as a pure
function of minutes-before-departure — 100% at 3+ hours, 80% at 2-3,
50% at 1-2, 0% under 30 minutes. **The spec's table has a gap**: nothing
is said about 30-60 minutes (it jumps straight from "1 to 2 hours: 50%"
to "under 30 minutes: 0%"). Rather than invent a fifth number, that band
is treated as the same 0% tier — called out in a comment there, not
silently assumed. `cancelBooking` always releases the seat regardless of
the percentage (per the spec table's SEAT column), and a 0%-refund
cancellation still goes through `REFUNDING` for a consistent ledger
trail, just skipping the payment-provider call since there's nothing to
send — it resolves straight to `REFUNDED` in the same request.

Departure time itself is computed in `getDepartureTime`: a Run's is its
`date` plus the board stop's `scheduledDeparture`; a Partner trip's is
just `departAt`. The same function backs an auto-no-show check folded
into `refreshBookingStatus` — spec: "at scheduled departure, an
unboarded passenger is marked no-show" — so once a HELD booking's
departure time has passed with no rider confirmation, the next time
anyone asks about it (same lazy pattern as everything else in this
service), it transitions to `FORFEIT` on its own. A GPS-flagged dispute
already moved the escrow out of HELD, so it can't double up with this.

**Reassignment** (`reassignBooking`) moves no money — the fare is
already in escrow and the spec's own framing ("keeps the seat filled,
the driver paid, the rider whole") implies the two riders settle between
themselves off-platform. What changes: `riderId` on the `Booking`, a
fresh `boardingCode`, both boarding taps reset to null so the recipient
must tap in themselves, and a `BookingTransfer` row for the audit trail.
The recipient must already be a verified CityShare user (same bar as
`requireVerified` — phone, Ghana Card, selfie) found by phone number;
there's no in-app contact picker or invite flow, just the number.

**Driver-side cancellation** (`cancelRun` / `cancelPartnerTrip`) is
scoped to bookings still `HELD` on that run or trip — refunds every one
in full regardless of timing, per spec, and marks the Run/PartnerTrip
`CANCELLED`. Not implemented: offering affected riders the next service
on the corridor, and counting the cancellation against Partner/Operator
status — both need a notification path and a reputation model (the
New→Verified→Trusted→Preferred ladder from spec section 8) that don't
exist yet.

### Driver identity and the Express run lifecycle (spec section 6)

`src/services/driver.ts` gives the run lifecycle a real actor: `isDriver`
plus a run's `driverId` (set by ops via `assign-driver`, since there's no
Operator roster or scheduling yet — step 10 owns that). Everything here
is scoped to `requireAssignedRun`, so a driver can only start, arrive,
depart, report on, or complete a run they were actually assigned to —
`startRun` moves a run `ASSIGNED -> IN_PROGRESS`, and `completeRun` moves
it to `COMPLETED` while deriving the whole run-complete summary
(stop-by-stop arrival record, seats carried, no-shows) from
`RunStopEvent` and `Booking`/`Escrow` rather than persisting anything new.

**Dwell tracking is a cap, not a countdown someone has to manage by
hand** (spec: "maximum dwell is three minutes"). `arriveAtStop` just
timestamps a `RunStopEvent`; `getStopStatus` computes `remainingSeconds`
live from that timestamp plus the stop's `maxDwellSeconds` every time
it's asked, so there's nothing to keep in sync — the driver app's
countdown is just this number ticking down locally between polls.
`departStop` timestamps the other side and, when told to
(`markNoShowForUnboarded`), forfeits every booking still unboarded for
that specific stop — scoped to `boardStopId`, so a passenger boarding
further down the route is untouched by a stop dwell running out. This
reuses `markNoShow` from `booking.ts` directly (bypassing the HTTP-level
ownership check in `bookings.ts`, since the driver's assignment was
already verified by `requireAssignedRun`), now generalized to accept
`EscrowActorType.DRIVER` with the driver's own id recorded in the ledger
— previously every no-show was attributed to `OPS`.

Incidents (`reportIncident`) are a flat append — `RunIncident` with a
category from the design's five (`heavy_traffic`, `vehicle_fault`,
`stop_blocked`, `passenger_issue`, `accident_sos`), an optional note and
GPS. Nothing consumes them yet (no ops dashboard, no rider delay
notification) — this is the write side of a queue step 9 will read.

The GPS coordinates a driver's boarding tap needs (spec section 4) come
from the stop itself: `GET /runs/:id/segments` now returns each stop's
`lat`/`lng`/`maxDwellSeconds` alongside its schedule, so a driver app has
real coordinates to submit rather than none at all — this was missing
until step 8 needed it for real, and its absence would have silently
forced every driver tap into a GPS-mismatch dispute (no lat/lng ever
within tolerance of anything).

### Partner trip management (spec: Partner home / passenger list / earnings)

The Partner-facing counterparts to the driver endpoints above, since a
Partner already **is** the driver of their own trip. `GET
/partner-trips/mine` and `/partner-trips/:id/manifest` reuse the same
availability and manifest shapes as the Run/driver side. `mark-no-show`
on `bookings.ts` was widened this step to check the owning Partner (or
the assigned driver on a Run) before falling back to requiring ops — the
spec's passenger-list "No-show" button doesn't need an ops escalation
when the caller demonstrably is the driver.

`GET /partner/earnings` reports real aggregates only: `available`
(`Payout` rows `APPROVED`), `pending` (still `PENDING`), and `held`
(active bookings' fares still sitting in escrow) — no commission
percentage, because none has been decided (spec marks Operator/Partner
revenue shares "to be agreed"). One bug worth calling out: payouts
resolve lazily like every other mock-provider outcome, but nothing else
in the request path polls them the way `GET /bookings/:id` polls a
pending payment — without an explicit resolve step here, a payout whose
`resolvesAt` had already passed would report `PENDING` forever, since no
other endpoint ever asks the provider about it again. The earnings route
now resolves every pending payout for the caller before aggregating.

Not implemented: cash-out to Mobile Money (the mobile earnings screen
shows why), and any Operator entity at all — every "Operator" role in
this step's code is really `User.isPartner`/`isDriver` standing in for
it, same pattern as `isOps` since step 4.
