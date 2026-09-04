# CityShare mobile

Step 1 of the build order: the rider verification flow (phone -> Ghana Card
+ selfie -> verified), recreated from `CityShare App.dc.html` at high
fidelity — see `src/theme/tokens.ts` for the exact colors/type transcribed
from the design handoff, and `src/screens/VerificationScreen.tsx` for the
screen itself.

## Stack

Expo (React Native + TypeScript). No navigation library yet — there is
only one screen so far; add one (e.g. `expo-router` or `@react-navigation`)
when the search/results/booking screens are built.

## Running

```
npm install
npm run start   # then press i / a / w, or scan the QR code in Expo Go
```

Point `src/api/config.ts` at your backend (defaults to `localhost:4000`,
or `10.0.2.2:4000` on the Android emulator). Start the backend first — see
`../backend/README.md`.

## What's here vs. not

Implemented: the full phone-verification -> Ghana Card/selfie -> verified
flow, wired to the real backend endpoints (`/api/auth/phone/*`,
`/api/auth/identity`).

Mocked, by design, until the corresponding blocker clears (see root
README): there's no real SMS carrier, so the OTP is echoed back by the
backend in dev; there's no NIA/Ghana Card integration or live-selfie
liveness check, so identity verification submits fixed placeholder values
and the backend always matches them. Swapping in real providers only
touches the backend service layer, not this screen.

Not built yet: search home, results, trip detail, payment, ticket, live
trip, and every other screen in the design bundle — those come later in
the build order (README steps 2-10).
