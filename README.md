# CityShare

A shared-mobility marketplace for Greater Accra: riders book individual
seats on journeys already happening, sold by private Partners and
certified Express Operators on one marketplace, paid by Mobile Money into
escrow that only releases once both rider and driver confirm boarding.

This repo is being built from a design handoff following the build order
in the handoff spec. Current status: **step 9** — the ops dashboard.

- [`backend/`](backend/README.md) — Node.js/TypeScript/Express API +
  PostgreSQL (Prisma): phone + Ghana Card verification, corridor/service/
  stop/run model, per-segment seat inventory and holds for both Express
  and Partner trips, the escrow ledger/state machine with a mock MoMo
  payment provider behind it, GPS-verified two-sided boarding with an
  offline-safe tap queue, the cancellation/reassignment/no-show policy
  engine, real driver identity driving the Express run lifecycle plus
  Partner trip management, and the ops dashboard's read layer (live
  summary, dispute queue, corridor overview).
- [`mobile/`](mobile/README.md) — Expo/React Native app: phone/ID
  verification, the rider-facing search → results → trip detail → pay →
  digital ticket flow, Partner mode (list a trip, manage passengers,
  earnings), and the Express driver app (shift start, at a stop, en
  route, run complete) — all wired to the real backend and recreated at
  high fidelity from the design.
- [`ops/`](ops/README.md) — Vite/React/TypeScript ops dashboard: live
  network status, the boarding-dispute queue, and corridor/stop
  profiles — a separate desktop web app, matching the design handoff's
  own 1440px layout for this screen.

## Build order

1. **Identity and verification** ✅ (backend + mobile screen)
2. **Corridor / service / stop / run model** ✅ (backend)
3. **Seat inventory, including per-segment Express Stops** ✅ (backend)
4. **Escrow ledger and state machine** ✅ (backend, incl. the mock payment
   provider step 5 calls for)
5. **Booking, payment, ticketing as a rider-facing flow** ✅ (mobile:
   search, results, trip detail, pay, digital ticket)
6. **Boarding verification with offline queueing** ✅ (backend: GPS
   geofence check on both taps, driver-side deny-boarding, rider location
   trail, per-run manifest, offline-preserved tap timestamps)
7. **Cancellation / reassignment / no-show policy engine** ✅ (backend:
   refund ladder by time-to-departure, seat-preserving reassignment to a
   verified rider, driver-side full-refund cancellation, lazy
   auto-no-show once scheduled departure passes)
8. **Driver app (Express) and Partner trip management** ✅ (backend:
   driver identity, run assignment, dwell tracking, depart/no-show,
   incidents, Partner manifest/no-show/earnings; mobile: Partner mode and
   Express driver app screens)
9. **Ops dashboard** ✅ (backend: live summary, dispute queue, corridor
   overview endpoints; a new `ops/` Vite/React web app for Live ops,
   Escrow & disputes, and Corridors & stops)
10. Express Operator portal

## Known blockers (not code — see design handoff for detail)

Mobile Money merchant agreement and the escrow regulatory route; insurance
for a private vehicle carrying a fare-paying passenger (unresolved,
largest risk in the model); Ghana Card / NIA verification; legal review of
all cancellation/dispute/membership copy; Express Operator commercial
terms. None of these block building steps 3-10 above — they block launch.
