# RegrettableAttritionRadar

Score employee flight risk, quantify replacement cost, and rank where retention spend has the best ROI.

RegrettableAttritionRadar (RAR) is a deterministic, explainable people-analytics platform that helps People leaders see who is likely to leave, which of those exits would actually hurt (regrettable vs non-regrettable), what each loss costs to replace, and where a finite retention budget produces the most risk-reduction-per-dollar. Every score is rule-weighted and transparent, with no black-box ML, so a VP of People can defend every number in a board meeting and a manager can see exactly which factors drive a report's flight risk.

See `docs/idea.md` for the full product specification, target users, and feature breakdown.

## Stack

- Backend: Hono on Node (TypeScript, ESM), Drizzle ORM over Neon Postgres.
- Frontend: Next.js 16, React 19, TypeScript (strict), Tailwind 4, App Router, located at `web/`.
- Auth: Neon Auth (`@neondatabase/auth`). The Next.js proxy resolves the session server-side and forwards an `X-User-Id` header to the backend.
- Package manager: pnpm.

The backend exposes its API under `/api/v1/*` with a root `/health` check. The browser never calls the backend directly; all calls go through the same-origin Next.js proxy at `/api/proxy/*`, which injects the authenticated user id.

## Local Development

Prerequisites: Node 22+, pnpm, and a Postgres connection string (Neon recommended). The schema is provisioned out-of-band (drizzle push or the Neon console); the backend seeds sample data on first boot but does not create tables itself.

### Backend

```bash
cd backend
pnpm install
# create backend/.env (see below)
pnpm dev
```

The backend runs on `http://localhost:3001`.

### Frontend

```bash
cd web
pnpm install
# create web/.env.local (see below)
pnpm dev
```

The web app runs on `http://localhost:3000`.

### Docker Compose

Alternatively, bring both services up together:

```bash
docker compose up --build
```

## Environment Variables

### Backend (`backend/.env`)

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
```

### Frontend (`web/.env.local`)

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_API_URL` is the only public variable and is baked into the bundle at build time. The `NEON_AUTH_*` variables are server-only.

## Pricing

All features are free for signed-in users. There is no paid tier or metered billing; sign in and the full platform (flight-risk scoring, regrettable-exit classification, replacement-cost modeling, cohort survival curves, manager attribution, retention-ROI optimizer, exit-driver register, and the quarterly board pack) is available.
