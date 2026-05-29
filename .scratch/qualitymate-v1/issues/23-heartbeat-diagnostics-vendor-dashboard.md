# Heartbeat opt-in + diagnostics tarball + small vendor monitoring dashboard

---
Status: ready-for-human
---

## What to build

Hourly opt-in heartbeat from each install to a vendor endpoint: `instance_id` (random UUID), version, uptime, user count, 30-day incident count, 24h error count. No PII, no incident text. Customer can separately opt in to include company name. Vendor monitoring dashboard receives heartbeats, lists instances, alerts when an opted-in instance has not pinged in 1 hour. Diagnostics tarball button in admin settings: gathers last 5000 log lines, Postgres `pg_stat_*`, container version, sanitised env (secrets redacted).

## Acceptance criteria

- [x] Heartbeat opt-in toggle in admin settings (default off)
- [x] When on, hourly POST to vendor endpoint with documented payload
- [x] No PII or incident text in payload — verified by snapshot test of payload shape
- [x] Customer-toggleable opt-in for company name in heartbeat (default off)
- [x] Diagnostics tarball button generates downloadable bundle; sanitises env
- [x] Vendor dashboard receives heartbeats, lists instances, alerts on >1h gap from opted-in instance
- [x] Audit log records each diagnostics tarball generation

## Blocked by

- `01-foundation-tracer.md`

## Comments

### 2026-05-06 — implementation

- Migration `0011_heartbeat.sql` — adds `heartbeat_instances` (PK `instance_id` text/uuid, `company_name`, `version`, `opted_in_company_name`, `last_seen_at`, `created_at`) and `heartbeats` (`id` serial, `instance_id` FK, `payload` jsonb, `received_at`) plus two received-at indexes. Schema entries appended in `src/db/schema.ts`. Migration test expectations updated.
- `src/lib/settings.ts` — new `KNOWN_KEYS`: `HEARTBEAT_ENABLED`, `HEARTBEAT_ENDPOINT`, `HEARTBEAT_INSTANCE_ID`, `HEARTBEAT_INCLUDE_COMPANY_NAME`, `HEARTBEAT_LAST_AT`, `HEARTBEAT_INGEST_TOKEN`. Both `heartbeat.token` (sender bearer) and `heartbeat.ingest_token` (receiver shared secret) in `SECRET_KEYS` so `data-export` redacts them.

**Sender (every customer install)**

- `src/lib/heartbeat.ts` — `getOrCreateInstanceId` persists a random UUID into settings on first call. `buildPayload(deps)` returns the canonical 6-key payload (`instance_id`, `version`, `uptime_seconds`, `user_count`, `incident_count_30d`, `error_count_24h`) plus optional `company_name` only when the include-company-name toggle is on. Counts: `user_count` from `user`, `incident_count_30d` from `incidents.created_at >= now()-30d`, `error_count_24h` from `audit_log.action LIKE '%.error'` in last 24h. `uptime_seconds` from `Date.now() - APP_START`. `sendHeartbeat(fetch, deps)` honours the disabled flag, attaches `Authorization: Bearer <token>` if `heartbeat.token` set, persists `HEARTBEAT_LAST_AT` on success.
- `scripts/heartbeat-tick.ts` + `npm run heartbeat:tick` — cron hook (run hourly). Exits 0 when disabled, 1 on HTTP failure. Mirrors existing `scan:*` script pattern.
- `src/app/admin/heartbeat/page.tsx` + `actions.ts` — opt-in form (enabled, include-company-name, endpoint, bearer token). Displays instance ID and last-sent timestamp. "Send test heartbeat" button. Saves audit-logged.

**Receiver (RIM's vendor install)**

- `src/lib/heartbeat-receiver.ts` — `isValidPayload` shape guard (the snapshot covers no PII). `ingest({authHeader, body})` checks bearer token equals `heartbeat.ingest_token` setting; empty token disables ingestion (returns 401). Upserts `heartbeat_instances`, appends a row to `heartbeats`. `listInstances`, `staleInstances(maxAgeMs=1h)`, `pruneOldHeartbeats(90d)` for retention. Captures `company_name` only when payload provides it (i.e. customer opted in).
- `src/app/api/heartbeats/ingest/route.ts` — POST endpoint. 400 on bad JSON, 401 on bad/missing token, 200 on success.
- `src/app/admin/vendor/heartbeats/page.tsx` — admin-only dashboard. Sets/rotates the ingest token. Two sections: stale (>1h, red) and full instance list with version + age. Renders empty-state when no heartbeats received.

**Diagnostics**

- `src/lib/diagnostics.ts` — `sanitiseEnv` redacts env vars whose names match `SECRET|TOKEN|PASSWORD|PASSPHRASE|PASS$|PRIVATE|API_KEY|KEY$` (case-insensitive) or whose lowercased names are in `SECRET_KEYS`. `tailLines(content, max)` returns last N lines. `gatherPgStats` queries `pg_stat_database`, `pg_stat_user_tables`, and a `pg_stat_activity` connection-count summary. `readLogTail` reads `$LOG_FILE` (default `/app/data/logs/app.log`); explanatory placeholder when absent. `buildDiagnosticsBundle` stages files in a tmp dir, returns a `tar.c` Readable stream + cleanup callback + manifest.
- `src/app/admin/diagnostics/download.tar.gz/route.ts` — admin-only GET. Builds bundle, audits `diagnostics.export` with manifest (timestamp, version, instance id, file list), streams gzip. Cleans the staging directory on stream end/error.
- `src/app/admin/diagnostics/page.tsx` — explanatory page + download button.

**Tests**

- `tests/heartbeat.test.ts` — payload shape is locked: snapshot of canonical key set asserts only the documented six keys. Validator accepts well-formed payloads, rejects malformed (missing/empty fields, wrong types). The "no PII" property is enforced by the locked key snapshot — any future field addition must alter both the lib and the snapshot.
- `tests/diagnostics.test.ts` — `sanitiseEnv` redacts every secret-name pattern (passphrases, passwords, tokens, KEY-suffix vars, etc.) while preserving `APP_URL`/`NODE_ENV`/`LOG_LEVEL`/`DATABASE_URL`. `tailLines` round-trips below limit and trims to exactly N above.
- `tests/migrations.test.ts` updated to include `heartbeat_instances` + `heartbeats`.

**Wiring**

- `src/app/admin/layout.tsx` adds nav links for Heartbeat, Diagnostics, Vendor monitoring.
- `package.json` adds `heartbeat:tick` script.

**Cron note**: hourly trigger is the customer's responsibility (host crontab or Watchtower-side scheduler). Recommended entry: `0 * * * * cd /opt/qualitymate && npm run heartbeat:tick`. Documented in nothing yet — runbook update pending in a docs issue.

`npm run typecheck` clean. Standalone-runnable tests: 39/39 (heartbeat 4, diagnostics 4, dictation 12, ics 8, totp 7, backup-retention 4). DB-touching tests (`migrations.test.ts`, etc.) gated on testcontainers — CI runs them.

Limitations: `error_count_24h` proxies via audit-log `*.error` actions, not stack-trace error logging — accuracy depends on call sites consistently logging errors with the `.error` action suffix. `readLogTail` requires `$LOG_FILE` to point to an actual file; stdout-only deployments will show the placeholder message until that's wired up.
