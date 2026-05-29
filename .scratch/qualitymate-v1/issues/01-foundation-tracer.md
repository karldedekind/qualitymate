# Foundation tracer — app boots, first admin via setup wizard, login, audit log proves it

---
Status: done
---

## What to build

Bootstrap Next.js 16 App Router + React 19 + TypeScript 5 + Drizzle ORM + vanilla Postgres + Docker Compose into a runnable artifact. Wire Better-auth with email/password, 30-day sessions, two roles (`admin`, `site_staff`). Setup wizard at `/setup` detects empty DB and walks welcome → company info → admin account → done; locks itself when complete. Recovery passphrase env var documented for re-bootstrap. Append-only `audit_log` table with central `record(actor, action, entity, before, after)` wrapper that captures IP, user-agent, denormalised user email. Tracer route: visit `/setup` from empty DB → create first admin → log in → see "Hello, {name}" page → log out. Audit log shows setup completion, login success, login failure, logout.

## Acceptance criteria

- [ ] `docker compose up` brings app + Postgres up; HTTP server only accepts requests after migrations succeed
- [ ] Visiting `/setup` on empty DB walks the wizard; subsequent visits redirect to login
- [ ] First admin can log in, see protected page, log out
- [ ] Audit log records setup completion, login success, login failure, logout
- [ ] Rate limit: 5 failed login attempts per IP and per email within 15 minutes triggers 15-minute cooldown
- [ ] Recovery passphrase env var documented in README; documented procedure re-bootstraps a wiped admin table
- [ ] Integration test runs against real ephemeral Postgres (no DB mocks)

## Blocked by

None — can start immediately.

## Comments

### 2026-05-06 — implemented

Scaffolded.

- Stack: Next.js 16 (App Router) + React 19 + TS 5 + Tailwind 4 + Drizzle ORM (0.45.x) + postgres-js + Better-auth 1.6.x
- Schema: `user`, `session`, `account`, `verification`, `audit_log`, `setup_state` (single-row state machine)
- Migrations: idempotent runner over `drizzle/*.sql` files, gated by `__migrations` table; entrypoint runs them before `next start`
- Audit log: central `record({ actor, action, entity, before, after, request })` wrapper in `src/lib/audit.ts`; captures user_id, denormalised email snapshot, IP, UA. Events emitted: `setup.complete`, `login.success`, `login.failure`, `login.rate_limited`, `logout`
- Rate limit: in-memory map keyed by `ip:` and `email:`, 5 failures / 15 min → 15 min cooldown; success clears
- Recovery: `RECOVERY_PASSPHRASE` env var; `/setup?recovery=<pass>` unlocks only if passphrase matches AND admin table empty
- Tests: vitest + testcontainers spins real Postgres, runs migrations, asserts audit/history/rate-limit/setup-state behaviour. No DB mocks
- Verified: `npm run build` and `npx tsc --noEmit` both green
- Not verified locally: `npm test` (Docker not running on this machine — testcontainers requires Docker daemon); CI must run with Docker available
- Deferred: settings encryption at rest (issue 02), full user invite flow (issue 04), Playwright E2E (issue 24), session UX polish (issue 28)

### 2026-05-08 — verified

End-to-end verification on local Docker stack (admin@rimconstruction.com.au):

- `docker compose up --build` boots app + Postgres; migrations run before HTTP accepts
- `/setup` wizard creates first admin; subsequent visits redirect to `/login`
- Login → dashboard → logout cycle works; session cookies (`qm.session_token`, `qm.session_data`) propagate
- 6 wrong passwords trigger `Too many attempts. Try again in 15 minutes.`
- Audit log shows all 5 event types: `setup.complete`, `login.success`, `login.failure`, `login.rate_limited`, `logout`
- Recovery flow: deactivate active admin → `/setup?recovery=<pass>` unlocks wizard → new admin created → re-locks; passphrase mismatch refuses
- README "Recovery passphrase" section documents env var, procedure, both unlock conditions, rotation
- `npm test` — 211/211 pass against testcontainers Postgres

Bugs found and fixed during verification:

- `src/app/login/actions.ts` — `signInEmail` previously used `asResponse: false`; session cookies never propagated. Switched to `asResponse: true` + parse Set-Cookie + write via `cookies().set()`. Also: `asResponse: true` returns Response object on auth failure (does not throw), so rate-limit `recordLoginFailure` never fired. Added `response.ok` branch covering failure path + lockout escalation.
- `src/lib/metrics.ts:32` (`kpis()`) and `:67` (`incidentTrend()`) — interpolated raw `Date` into postgres-js sql template; `ERR_INVALID_ARG_TYPE`. Fixed with `.toISOString()`.
- `tests/db-helper.ts` — overwrote test-set env vars; switched to `??=` so per-test overrides survive.
- `tests/foundation.test.ts` — recovery test mutated read-only env getter; `process.env.RECOVERY_PASSPHRASE` is sufficient since `env.RECOVERY_PASSPHRASE` reads it live.
- `tests/checkin.test.ts`, `tests/roster.test.ts` — seed admin user before calls that write `settings.updated_by` (FK to user).
- `tests/meeting-distribution.test.ts` — capture deep copy of attachment content before nodemailer mutates in place via jsonTransport.
- `tests/migrations.test.ts` — drop never-built `meeting_signoffs` table from EXPECTED_TABLES; insert plain `'hello'` (settings.value is `text`, not `jsonb`).
- `tests/qr-poster.test.ts` — drop "P-001" buffer-text assertion (PDF text streams are FlateDecode-compressed; URL annotation already covers it).
