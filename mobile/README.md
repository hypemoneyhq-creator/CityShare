# CityShare mobile

Step 5 of the build order: the rider-facing booking flow (search, results,
trip detail, pay, digital ticket), on top of the verification screen from
step 1. Recreated from `CityShare App.dc.html` at high fidelity — see
`src/theme/tokens.ts` for the exact colors/type transcribed from the
design handoff.

## Stack

Expo (React Native + TypeScript), `@react-navigation/native-stack` for
the screen flow, `AuthContext` (`src/state/AuthContext.tsx`) for the
session token/user shared across screens, `@react-native-async-storage`
for the offline ticket cache.

## Running

```
npm install
npm run start   # then press i / a / w, or scan the QR code in Expo Go
```

Point `src/api/config.ts` at your backend (defaults to `localhost:4000`,
or `10.0.2.2:4000` on the Android emulator). Start the backend first — see
`../backend/README.md`, and run its `npm run seed` so there's a corridor,
services and a Partner trip to search.

## Screens

| Screen | Backed by |
|---|---|
| Verification | `/api/auth/phone/*`, `/api/auth/identity` |
| Search home | `/api/corridors` (the one seeded corridor) |
| Results | corridor services + `/api/runs/:id/segments` + `/api/partner-trips` |
| Trip detail | leg picker (Express Stops) / seat stepper, creates a hold |
| Payment | `/api/holds/:id/pay` or `/api/partner-holds/:id/pay`, polls `/api/bookings/:id` |
| Digital ticket | `/api/bookings/:id`, cached to AsyncStorage for offline render |

In dev builds (`__DEV__`), the Payment screen shows "force the mock MoMo
outcome" buttons (Approve/Decline/Timeout) — there's no real MoMo network
to test against, so this drives the backend's `forceOutcome` test control
directly instead of waiting on a phone-number convention.

## Fidelity adaptations (and why)

The Results/Trip detail screens show an "operated by" row for Express
services, but there's no Operator entity yet (Express Operator
certification is step 10) — rather than fabricate a company name and
star rating the backend has no record of, that row shows the real service
name and vehicle capacity instead. The Partner card shows real data
throughout (name, vehicle, comfort facts, verification), since a Partner
and their trip genuinely exist in the backend.

The Payment screen's summary also skips the design's illustrative ₵1
booking fee — the backend doesn't charge one, so showing it would mean
the on-screen total doesn't match what's actually held in escrow.

## Not built yet

My trips, membership, live trip tracking (real-time GPS), rating,
Partner onboarding/mode, and every driver/ops/operator surface — those
are later steps (6-10). "Track this trip" and "My trips" links from the
ticket screen are intentionally omitted rather than left as dead buttons.
