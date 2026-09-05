# CityShare backend

Steps 1-3 of the build order from the design handoff: identity & phone
verification, the corridor -> service -> stop -> run data model, and seat
inventory including per-segment Express Stops. No escrow or real payment
capture yet — seat holds exist but nothing moves money (step 4+).

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
| GET | `/api/runs/:id/segments` | — | Stops + per-leg seat availability + leg fares for a run |
| POST | `/api/runs/:id/holds` | Bearer, verified | Hold seats on a run for a board/alight stop pair |
| POST | `/api/holds/:id/release` | Bearer | Release a run seat hold before it expires |
| POST | `/api/partner-trips` | Bearer, verified, Partner | Create a Partner trip listing |
| GET | `/api/partner-trips?corridorId=` | — | List scheduled Partner trips with available seats |
| POST | `/api/partner-trips/:id/holds` | Bearer, verified | Hold seats on a Partner trip |
| POST | `/api/partner-holds/:id/release` | Bearer | Release a Partner trip seat hold |

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
`computeRunFare`.
