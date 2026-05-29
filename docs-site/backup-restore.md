# Backup and Restore

## What's backed up

QualityMate ships with a logical backup that captures everything needed to restore the install:

- Every Postgres table as CSV (RFC 4180, COPY-driven).
- The full migrations directory, so the schema can be re-applied to an empty Postgres of the same major version.
- The `data/uploads/` tree (incident photos, branding logos, signatures).
- A `manifest.json` with timestamp, tables, file counts, tool version.

Packed as a single `.tar.gz` under `data/backups/`.

## Schedule

Default cron entries (from [Setup](setup.md)):

```
0 2 * * *   ... npm run backup
0 3 * * 1   ... npm run backup:weekly-email
```

Retention is **7 daily + 4 weekly + 12 monthly**. Older tarballs are pruned automatically.

## Offsite (S3)

Configure S3-compatible storage under **Admin → Settings → S3** (Backblaze B2, Wasabi, MinIO, etc. all work). Each tarball is pushed after creation.

## Listing backups

**Admin → Backups** lists every tarball in `data/backups/`. Click to download.

## Manual backup

```bash
docker compose exec -T app npm run backup
```

The path of the new tarball is printed.

## Restore

!!! danger "Destructive"
    Restore TRUNCATEs every table before importing. Take a fresh backup first.

```bash
# Place the tarball at ./data/restore/qualitymate-backup-<stamp>.tar.gz
docker compose exec -T app npm run restore data/restore/qualitymate-backup-<stamp>.tar.gz
```

The script:

1. Applies migrations on the current DB.
2. `SET session_replication_role = replica` (FK checks off).
3. TRUNCATEs every table in reverse dependency order.
4. COPYs every CSV in forward dependency order.
5. Resyncs sequences (for serial PKs).
6. Restores `uploads/` over `data/uploads/`.
7. Re-enables FK checks.

Smoke-test post-restore:

```bash
# Sign in. Check Admin → Audit log for the entries you remember from before.
# Check Admin → Incidents for a familiar incident's photo.
```

## Disaster recovery

See the full DR runbook (vendor-internal): [DR Runbook](https://github.com/karldedekind/qualitymate-runbook). Public summary:

- A backup is **only** useful if you've tested restore. Run a restore drill quarterly into a throwaway compose stack.
- Offsite is mandatory for ISO 9001 — even if it's a single S3 bucket on Backblaze.
- The `INSTALL_PASSPHRASE` is **not** in the backup. Encrypted settings (SMTP password, AI key, S3 keys) are unreadable without it. Keep the passphrase out-of-band — a printed copy in a safe is fine.
