# CityShare mobile

Steps 1 and 5-8 of the build order: the verification screen, the
rider-facing booking flow (search, results, trip detail, pay, digital
ticket), boarding verification, Partner mode (list a trip, manage
passengers, earnings), and the Express driver app (shift start, at a
stop, en route, run complete). Recreated at high fidelity from the
`CityShare App.dc.html` and `CityShare Driver.dc.html` design handoffs —
see `src/theme/tokens.ts` for the exact colors/type transcribed from the
design.

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
| Search home | `/api/corridors` (the one seeded corridor); also the entry point into Partner/driver mode |
| Results | corridor services + `/api/runs/:id/segments` + `/api/partner-trips` |
| Trip detail | leg picker (Express Stops) / seat stepper, creates a hold |
| Payment | `/api/holds/:id/pay` or `/api/partner-holds/:id/pay`, polls `/api/bookings/:id` |
| Digital ticket | `/api/bookings/:id`, cached to AsyncStorage for offline render |
| Partner home | `/api/partner-trips/mine`, `/api/partner/earnings` |
| Partner create trip | `POST /api/partner-trips` |
| Partner passenger list | `/api/partner-trips/:id/manifest`, board/no-show actions |
| Partner earnings | `/api/partner/earnings` |
| Driver shift start & checks | `/api/driver/runs`, `/api/runs/:id/start` |
| Driver at a stop (boarding) | `/api/runs/:id/stops/:stopId/{arrive,dwell,depart}`, `/api/runs/:id/manifest`, board/no-show |
| Driver en route | remaining-stop list from `/api/runs/:id/segments` + manifest, `/api/runs/:id/incidents` |
| Driver run complete | `/api/runs/:id/complete` |

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

The Partner home screen drops the design's rating/status-ladder chips
(New→Verified→Trusted→Preferred doesn't exist as a computed field) and
shows real fill-rate and available-earnings numbers instead. Partner
create-trip drops the design's recurring-trip toggle (no backend support)
and its map picker (origin/destination coordinates default to fixed
Kasoa/Circle points, since there's no `expo-location`/map integration in
this build). Partner earnings' "Cash out to MoMo" button is visibly
present but disabled, with a note explaining there's no real payout rail
yet — it's not hidden, since the design commits to it being there.

The driver en-route screen drops the design's live map and "N MIN BEHIND
SCHEDULE" pace readout — this build has no continuous GPS tracking (only
tap-based boarding evidence at stops), so there's nothing real to render
a live position or ETA from. The occupancy counts and remaining-stops
list shown instead are computed from the actual manifest. The run-complete
screen similarly drops the design's claim that the record "feeds your
operator's corridor performance" (no Operator entity, no scoring system)
in favor of the real stop-by-stop on-time record.

The driver's boarding-tap GPS coordinates come from the run's own stop
data (`segments.stops[i].lat/lng`) rather than the device's live
location — there's no `expo-location` integration in this build, so the
stop's stored coordinates stand in for "the driver is at the stop."

## Not built yet

My trips, membership, live trip tracking (real-time GPS), rating, and
every ops/Express-Operator surface — those are steps 9-10.
