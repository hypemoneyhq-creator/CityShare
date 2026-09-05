# CityShare

A shared-mobility marketplace for Greater Accra: riders book individual
seats on journeys already happening, sold by private Partners and
certified Express Operators on one marketplace, paid by Mobile Money into
escrow that only releases once both rider and driver confirm boarding.

This repo is being built from a design handoff following the build order
in the handoff spec. Current status: **step 4** — escrow ledger and
state machine.

- [`backend/`](backend/README.md) — Node.js/TypeScript/Express API +
  PostgreSQL (Prisma): phone + Ghana Card verification, corridor/service/
  stop/run model, per-segment seat inventory and holds for both Express
  and Partner trips, and the escrow ledger/state machine with a mock
  MoMo payment provider behind it.
- [`mobile/`](mobile/README.md) — Expo/React Native rider app. Currently
  just the verification flow, recreated at high fidelity from the design.

## Build order

1. **Identity and verification** ✅ (backend + mobile screen)
2. **Corridor / service / stop / run model** ✅ (backend)
3. **Seat inventory, including per-segment Express Stops** ✅ (backend)
4. **Escrow ledger and state machine** ✅ (backend, incl. the mock payment
   provider step 5 calls for)
5. Booking, payment, ticketing as a rider-facing flow (search, pay,
   digital ticket) — the mock provider and escrow machinery it needs
   already exist; this step is the client-facing UX on top
6. Boarding verification with offline queueing
7. Cancellation / reassignment / no-show policy engine
8. Driver app (Express) and Partner trip management
9. Ops dashboard
10. Express Operator portal

## Known blockers (not code — see design handoff for detail)

Mobile Money merchant agreement and the escrow regulatory route; insurance
for a private vehicle carrying a fare-paying passenger (unresolved,
largest risk in the model); Ghana Card / NIA verification; legal review of
all cancellation/dispute/membership copy; Express Operator commercial
terms. None of these block building steps 3-10 above — they block launch.
