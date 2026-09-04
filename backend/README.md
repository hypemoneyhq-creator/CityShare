# CityShare backend

Step 1 of the build order from the design handoff: identity & phone
verification, and the corridor -> service -> stop -> run data model. No
seat inventory, escrow, or booking yet — those are steps 3+.

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
| GET | `/api/corridors` | — | List corridors with their active services |
| GET | `/api/services/:id` | — | One service with its ordered stop profiles |
| GET | `/api/services/:id/runs?date=YYYY-MM-DD` | — | Runs for a service |

## Data model

`Corridor` -> `Service` (DIRECT or STOPS) -> `StopProfile` (ordered,
board/alight rules, max dwell) -> `Run` (a dated instance). See
`prisma/schema.prisma` for the full shape and `prisma/seed.ts` for the
Western corridor (Kasoa -> Circle, K01 direct / K02 stops) used by the
design prototypes.
