# QualityMate disaster recovery runbook

This document describes how to recover a QualityMate instance from a backup
tarball.

## Backup format

Each nightly backup is a single gzipped tarball:

```
qualitymate-backup-YYYY-MM-DDTHH-MM-SSZ.tar.gz
```

The archive contains:

| Path                          | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `manifest.json`               | tool version, generation timestamp, table list, counts  |
| `db/<table>.csv`              | one CSV per database table (RFC 4180, CRLF, FORCE_QUOTE)|
| `migrations/*.sql`            | the drizzle migrations bundle present at backup time    |
| `uploads/<scope>/<file>`      | verbatim copy of the uploads tree                       |

Tarballs are written to `data/backups/` and are subject to the **7 daily / 4
weekly / 12 monthly** retention policy.

## Locating a backup

1. **On-disk** — list the most recent local backups:
   ```sh
   docker compose exec app ls -lh /app/data/backups/
   ```
2. **Offsite (S3)** — when an S3-compatible bucket is configured the nightly
   cron pushes a copy with the same filename under the configured prefix
   (default `qualitymate/`). Pull the desired tarball back into `data/restore/`:
   ```sh
   aws s3 cp s3://<bucket>/qualitymate/<tarball> ./data/restore/
   ```
3. **Weekly admin email** — for instances under 25 MB the weekly cron emails
   the most recent tarball directly to the admin recipient.

## Restoring

The restore is destructive: it truncates every application table and replaces
the uploads tree. **Always work in a paused or freshly-spun instance.**

1. Place the tarball in `data/restore/` (or pass the absolute path on the CLI).
2. Run:
   ```sh
   docker compose run --rm app npm run restore
   # or, with an explicit path:
   docker compose run --rm app npm run restore -- /app/data/restore/qualitymate-backup-2026-05-06T02-00-00Z.tar.gz
   ```
3. Watch the log output: row counts per table are printed alongside an upload
   count. The restore CLI:
   - extracts the tarball to a tmpdir;
   - applies the bundled migrations (idempotent);
   - sets `session_replication_role = replica` to disable FK enforcement;
   - truncates each table in reverse FK order;
   - `COPY ... FROM STDIN` per CSV, in forward FK order;
   - re-syncs serial PK sequences (`audit_log`, `notifications`);
   - re-enables FK enforcement;
   - replaces `uploads/` byte-for-byte.
4. Restart the app:
   ```sh
   docker compose restart app
   ```

## Post-restore verification

Run the smoke checks that follow before declaring the restore complete:

- [ ] Sign in as the admin and load `/admin/audit-log` — recent rows visible.
- [ ] Open `/admin/incidents` — the most recent incident matches the backup
  manifest's `rowCounts.incidents`.
- [ ] Open a known incident with photos: confirm the photos render. (Photos
  live under `data/uploads/incidents/<incidentId>/`.)
- [ ] Trigger a manual backup from `/admin/backups` and confirm a fresh tarball
  is produced (this validates `pg_dump`/COPY connectivity).
- [ ] If S3 is configured, click **Test push** under Settings → Offsite backup.

## Total-loss recovery (greenfield)

If the entire host is gone:

1. Provision a new host with Docker + the `compose.yaml` from the repo.
2. Pull the most recent tarball from S3 or backups.
3. `docker compose up -d db` — start Postgres only.
4. `docker compose run --rm app npm run restore` — populate the database +
   uploads volume.
5. `docker compose up -d app` — bring the app online.

## Known limitations

- The logical backup is not byte-identical to the source database files; the
  CSV-based dump faithfully restores **row data**, not Postgres internals.
  External tools that rely on `pg_dump --format=custom` snapshots are not
  produced by this tooling.
- The schema baseline restored is the migration bundle that shipped with the
  source instance. Restoring an older backup into a newer codebase is supported
  — the post-restore migrate step will bring the schema forward — but the
  reverse is not (a backup taken on a newer codebase may carry tables the older
  migrations cannot create).
