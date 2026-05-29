# QualityMate

Self-hosted, single-tenant Quality Management System for small construction companies.

See [PRD](.scratch/qualitymate-v1/PRD.md).

## Quick start (local development)

```bash
# 1. install deps
npm install

# 2. start Postgres + app via Docker
cp .env.example .env
# edit .env: set BETTER_AUTH_SECRET (32+ random bytes), optional RECOVERY_PASSPHRASE
docker compose up --build

# 3. open http://localhost:3000 — redirects to /setup on empty DB
```

The container's entrypoint runs migrations before the HTTP server accepts requests. If migrations fail, the container exits non-zero and Docker restarts it; partial migrations are not possible.

## Local dev without Docker

```bash
docker run --rm -d --name qm-pg \
  -e POSTGRES_USER=qm -e POSTGRES_PASSWORD=qm -e POSTGRES_DB=qualitymate \
  -p 5432:5432 postgres:16-alpine

cp .env.example .env
# set DATABASE_URL=postgres://qm:qm@localhost:5432/qualitymate
# set BETTER_AUTH_SECRET=...

npm run db:migrate
npm run dev
```

## Tests

Tests run against a real Postgres started via [testcontainers](https://node.testcontainers.org/). Docker must be running.

```bash
npm test
```

## Recovery passphrase

If the `user` table loses every active admin (deletion, soft-delete, restore-from-backup gone wrong), you can re-bootstrap a new admin without touching SQL.

1. Set the env var on the running install:

   ```bash
   RECOVERY_PASSPHRASE=$(openssl rand -base64 24)
   ```

   Store it somewhere safe (password manager, sealed envelope). It is **not** stored in the database.

2. Restart the app container.

3. Visit `https://your-install/setup?recovery=<the-passphrase>` from a browser.

4. The wizard unlocks if and only if both conditions hold:
   - the passphrase matches `RECOVERY_PASSPHRASE`,
   - the `user` table contains zero active admins.

5. Complete the wizard. The new admin is created and `setup_state` is locked again.

6. Remove or rotate `RECOVERY_PASSPHRASE` afterwards.

If the passphrase is wrong **or** an admin already exists, the wizard refuses and `/setup` redirects to `/login` as normal.

## Project layout

```
.
├── compose.yaml
├── Dockerfile
├── drizzle/                    SQL migrations (numbered, idempotent runner)
├── scripts/entrypoint.sh       runs migrations then starts Next.js
├── src/
│   ├── app/                    App Router routes
│   │   ├── setup/              first-run wizard
│   │   ├── login/              email + password sign-in
│   │   ├── dashboard/          protected landing
│   │   ├── logout/route.ts     POST → sign out + audit
│   │   └── api/auth/[...all]/  Better-auth handler
│   ├── db/
│   │   ├── schema.ts           Drizzle schema
│   │   ├── index.ts            db client
│   │   └── migrate.ts          migration runner (CLI + library)
│   ├── lib/
│   │   ├── auth.ts             Better-auth config
│   │   ├── audit.ts            central record/history wrapper
│   │   ├── rate-limit.ts       in-memory IP+email failure window
│   │   ├── setup-state.ts      wizard state machine
│   │   ├── request-meta.ts     IP + UA from headers
│   │   └── env.ts              required env vars
│   └── proxy.ts                Next.js proxy (formerly middleware) — protects /dashboard, /admin
└── tests/                      vitest + testcontainers
```

## Acceptance for tracer (issue 01)

- [x] `docker compose up` brings app + Postgres up; HTTP only after migrations succeed
- [x] `/setup` walks the wizard on empty DB; subsequent visits redirect to login
- [x] First admin can log in, see protected page, log out
- [x] Audit log records `setup.complete`, `login.success`, `login.failure`, `logout`
- [x] Rate limit: 5 failed login attempts per IP and per email within 15 minutes triggers a 15-minute cooldown
- [x] Recovery passphrase env var documented; documented procedure re-bootstraps a wiped admin table
- [x] Integration test runs against real ephemeral Postgres (testcontainers, no DB mocks)
