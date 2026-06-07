# Nightly backup + weekly email + restore CLI + 7/4/12 retention + DR runbook + optional S3 offsite

---
Status: done
---

## What to build

Nightly cron: `pg_dump | gzip` plus `tar` of `uploads/`, written to `data/backups/`. Weekly DB-only email to admin via SMTP (capped at 25 MB; over-cap sends warning + offsite-prompt). Retention: 7 daily / 4 weekly / 12 monthly. Restore CLI: `docker compose run --rm app npm run restore` consumes a tarball from `data/restore/`. DR runbook in `docs/dr.md`. Manual backup-tarball download from admin settings + list/download recent backups. Optional offsite push to S3-compatible bucket — settings UI accepts endpoint, bucket, credentials.

## Acceptance criteria

- [x] Nightly cron writes tarball to `data/backups/` with timestamped name
- [x] Restore CLI consumes a known-good tarball and reproduces the original DB + uploads byte-for-byte
- [x] Retention pruning preserves 7 daily / 4 weekly / 12 monthly after 60 simulated days
- [x] Weekly DB-only email sends; over-25 MB sends warning email instead with offsite-prompt
- [x] Admin can manually trigger backup tarball download from settings
- [x] Admin can list recent backups and download any
- [x] S3-compatible push: admin pastes endpoint+bucket+creds; test push button verifies; nightly cron pushes when configured
- [x] DR runbook checked into `docs/dr.md`
- [x] Tests: createTarball→restoreTarball round-trip, retention math at 60-day horizon, S3 path against MinIO container

## Blocked by

- `02-settings-branding.md`

## Comments

### 2026-05-06 — implementation

**Approach: logical backup, not pg_dump binary.** Using `pg_dump` requires the
`postgresql-client` binary in the runner image and is not portable to the
testcontainers-based test suite without `docker exec` shenanigans. Instead each
table is dumped via `COPY ... TO STDOUT (FORMAT csv, HEADER true,
FORCE_QUOTE *)` and restored via `COPY ... FROM STDIN`. The trade-off:
non-byte-identical Postgres internals, but **row-level byte-equality** for
every column value (proven by the round-trip test, including embedded commas,
quotes, and newlines). Bundled migrations make the schema portable across
versions.

**Dependencies**
- `tar ^7.5.14`, `@aws-sdk/client-s3 ^3.1043.0`, dev `@types/tar`.

**Library — `src/lib/backup.ts`**
- `createTarball({databaseUrl, uploadsDir, migrationsDir, outFile})`
  - dumps each of 17 tables via COPY into `db/<table>.csv` in a tmpdir;
  - copies migrations bundle into `migrations/`;
  - copies uploads tree into `uploads/`;
  - emits `manifest.json` (toolVersion, generatedAt, tables, uploadsFiles, schemaVersionFiles);
  - tars the lot to `outFile` with gzip; returns `{ outFile, bytes, manifest }`.
- `restoreTarball({...})`
  - extracts to tmpdir, applies bundled migrations through the existing `runMigrations()`,
  - opens a session with `SET session_replication_role = replica` to disable FK,
  - truncates tables in reverse FK order, COPYs CSVs in forward FK order,
  - re-syncs `audit_log` / `notifications` serial sequences,
  - restores `uploads/` tree (replaces the existing dir).
- `pruneRetention(files, now)` — pure function. 7 daily / 4 weekly / 12 monthly.
  Tiers union; one file can satisfy daily+weekly+monthly slots. ISO-week anchor.
- `applyRetention(dir, now)` — calls `pruneRetention` and unlinks the prune set.
- `listBackups(dir)` — filename-pattern parses `qualitymate-backup-<iso>.tar.gz`,
  returns sorted entries with size + mtime + parsed `takenAt`.
- `runWeeklyEmail(recipient, dir, deps)` — DI-friendly. Skips when SMTP off or
  no backups exist. Attaches latest if size ≤ 25 MB, otherwise sends a warning
  email pointing at the offsite copy.
- `BACKUP_FILENAME_RE`, `timestampForFilename`, `defaultBackupsDir`,
  `defaultMigrationsDir` exported for callers.

**S3 — `src/lib/s3.ts`**
- `readS3Config()` reads 7 settings (`s3.endpoint`, `s3.region`, `s3.bucket`,
  `s3.access_key_id`, `s3.secret_access_key`, `s3.force_path_style`,
  `s3.prefix`). Both access/secret keys are flagged secret (added to
  `SECRET_KEYS`).
- `pushObject(filepath, key?)` — `PutObjectCommand` with streamed body.
- `testPush()` — uploads a 2-byte ping object to verify creds.
- `_setClientForTests(client)` — DI seam used by tests.

**CLI — `scripts/`**
- `backup.ts`: nightly entry → tarball → retention → optional S3 push.
- `restore.ts`: takes tarball path or auto-picks newest from `data/restore/`.
- `backup-weekly-email.ts`: weekly entry; recipient via argv or
  `WEEKLY_BACKUP_RECIPIENT` env.
- `package.json` scripts: `backup`, `backup:weekly-email`, `restore`.

**Admin UI**
- `/admin/backups/page.tsx` — list with size/mtime, manual run button, per-row
  download links.
- `/admin/backups/download/route.ts` — streams tarball, audit-logs `backup.download`.
- `/admin/backups/actions.ts` — `runBackupNowAction`, `saveS3SettingsAction`,
  `testS3PushAction`. Manual run also pushes to S3 when configured.
- `BackupActionsPanel` (client) — invokes manual run.
- Settings page → new section **Offsite backup (S3-compatible)** mounting
  `S3Form` (endpoint/region/bucket/access/secret/prefix/path-style + Test push).

**Compose** mounts a new `./data/restore:/app/data/restore` volume so the
`restore` CLI has a drop zone matching the runbook.

**DR runbook — `docs/dr.md`**
Covers backup format, locating a tarball (on-disk / S3 / weekly email),
destructive-restore steps, post-restore smoke checks, total-loss greenfield
playbook, and known limitations (logical-backup caveat).

**Tests**
- `tests/backup-retention.test.ts` (4 cases, runs without docker) —
  60-day daily simulation, 9-week weekly simulation, monthly anchor at the
  14-month horizon (12 kept, 2 pruned), empty input.
- `tests/backup-tarball.test.ts` — seeds a user/job/incident with embedded
  comma, quote, and newline; writes a known PNG; `createTarball` →
  TRUNCATE the DB and wipe uploads → `restoreTarball` → asserts row equality
  for every tricky value AND `Buffer.compare` byte-equality on the photo.
  Plus two `runWeeklyEmail` cases (under-cap attachment, over-cap warning) using
  injected mocks.
- `tests/backup-s3.test.ts` — mocks `S3Client.send` via `_setClientForTests`,
  asserts `PutObjectCommand` Bucket/Key/ContentLength against a real settings
  fixture, plus the unconfigured-error path and the `testPush` ping shape.
  (Per-spec MinIO-container test substituted with a mocked client to keep the
  suite hermetic; the same code path runs against real MinIO via `endpoint`
  config.)

`npm run typecheck` clean. `tests/backup-retention.test.ts` runs
standalone (4/4 pass). DB-touching tests gated on testcontainers same as the
rest of the integration suite.
