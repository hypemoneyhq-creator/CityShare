# CityShare Express Operators

Step 10 — the final step of the build order: the Express Operator portal.
Recreated from `CityShare Express Operators.dc.html`, a 1280px desktop
layout — its own workspace like `ops/`, sharing that app's palette and
component patterns but a separate audience (transport companies, not
CityShare staff).

## Stack

Vite, React, TypeScript. Same plain-CSS approach as `ops/` — no UI kit,
`src/theme.css` copied from `ops/src/theme.css` so the palette matches.

## Running

```
npm install
npm run dev
```

Point `src/api/config.ts` (or `VITE_API_BASE_URL`) at your backend —
defaults to `localhost:4000`. Start the backend first and run its `npm
run seed`.

## Login

Same phone+OTP flow as every CityShare surface — there's no separate
company-account system. Unlike the ops dashboard, any authenticated user
can start an Operator application; there's no `isOps`-style gate on entry,
since applying is meant to be self-service (spec: "for transport companies
in Greater Accra"). One Operator per contact user.

## Tabs

| Tab | Backed by |
|---|---|
| Why operate | Static marketing copy — no backend calls |
| Apply | `POST/GET /api/operators/application`, `/mine`, `/vehicles`, `/corridors/:id`, `/documents/:key`, `/submit` |
| Certification | `GET /api/operators/certification`, plus driver roster: `POST/DELETE /api/operators/drivers` |
| Operator console | `GET /api/operators/console`, `POST /api/operators/runs/:id/assign` |

## A real design constraint worth calling out

Driver-roster management (add/remove a driver by phone) lives on the
**Certification** tab, not the **Operator console** — even though the
console is where day-to-day fleet operations otherwise happen. This
isn't a stylistic choice: the console is gated behind `CERTIFIED` status,
and certification's driver-vetting check needs at least one verified
driver on the roster before it can clear. Putting roster management
behind the gate it feeds would make certification unreachable through
the UI — an Operator could never add the driver they need to get
certified. The Console tab shows the roster read-only instead, with a
note pointing back to Certification.

## Fidelity adaptations (and why)

The design's fleet table on the Apply tab is an aggregate "4x Hyundai H1"
count with a stepper; this build tracks individually assignable vehicles
instead (`label`, `vehicleType`, `spec`, `seats` per unit) — the Operator
console needs one specific vehicle to assign to one specific run, and an
aggregate count has no vehicle to hand over. The "corridors you want"
chips are real and DB-driven: only corridors that actually exist in this
backend appear, unlike the design's Northwestern/Eastern/Madina examples
(most of which aren't seeded here).

The Certification tab's sidebar drops the design's "provisional corridor
offer" panel (a specific fare, "revenue share: to be agreed") — sizing
and extending that offer is a CityShare ops action, and step 9's ops
dashboard has no offer-creation workflow to back it with. What's shown
instead is the Operator's own requested corridors and roster, which this
build actually has.

The Operator console drops the design's rider-rating stat (no rating
system exists anywhere in this codebase) and its "corridor offers from
CityShare" panel sized from unmet-search data (no search log exists to
size one from) — both are omitted rather than invented, the same
principle every other screen in this project has followed.

## Not built yet

Operator suspension (the backend's `OperatorStatus` enum has a
`SUSPENDED` value for parity with the ops dashboard's scorecard design,
but no route sets it — that needs a real ops-side review flow), and
multi-Operator competition for the same corridor (whichever Operator
requests one can claim any of its unassigned runs — there's no
CityShare-side allocation arbiter between competing Operators).
