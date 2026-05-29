# Troubleshooting

## Container won't start

Check the migrations log:

```bash
docker compose logs app | grep '\[migrate\]'
```

If migrations fail, the container exits non-zero on purpose — the HTTP server never starts on a partially-migrated DB. Fix:

1. Read the SQL error in the log.
2. If a migration is broken, restore the previous backup (see [Backup and Restore](backup-restore.md)).
3. Pin to the previous image tag in `.env`:

```env
APP_IMAGE=ghcr.io/karldedekind/qualitymate:sha-<previous>
```

## Login loop / "Setup not complete"

If `/login` keeps redirecting to `/setup` and you've already completed setup:

```bash
docker compose exec -T app psql ${DATABASE_URL} -c "SELECT * FROM setup_state;"
```

The row's `completed_at` should be set. If null, re-run setup with the recovery passphrase:

```
${APP_URL}/setup?recovery=<RECOVERY_PASSPHRASE>
```

## Email doesn't send

1. **Admin → Settings → SMTP → Send test**. If that fails, the host/port/credentials are wrong.
2. Check the audit log for `meeting.distribution.error` entries — they include the SMTP error message.
3. Confirm the host's outbound port 25/465/587 isn't blocked.

## AI suggestions return errors

1. **Admin → Settings → AI → Probe**. Confirms the Anthropic key is valid.
2. Anthropic may rate-limit or be unreachable — the suggestion path always degrades gracefully (the form still works, just without the suggestion).
3. Check the audit log for `incident.ai_suggest.error`.

## QR poster won't generate

1. Confirm the job has `active = true`.
2. Check `data/uploads/branding/` — if the logo file is missing, generation falls back to a text badge.

## Backup fails

```bash
docker compose exec -T app npm run backup 2>&1 | tail -50
```

Common causes:

- **Disk full** in `data/backups/` — prune manually or extend the volume.
- **S3 push failed** — open Admin → Settings → S3 → **Test push**. The local backup is still on disk; the push retries on the next cron tick.

## Restore fails partway through

The restore is wrapped in `session_replication_role = replica` so FKs don't block intermediate state. If it errors mid-COPY, the DB is in an inconsistent state:

```bash
docker compose exec -T app psql ${DATABASE_URL} -c "TRUNCATE … CASCADE"
docker compose exec -T app npm run restore <tarball>   # try again
```

If it still fails, restore from the previous tarball.

## Photos don't appear in the UI

`data/uploads/` must be writable by the container's `nextjs` user (UID 1001). If you mounted it with the wrong owner:

```bash
sudo chown -R 1001:1001 ./data/uploads
docker compose restart app
```

## Watchtower didn't update

```bash
docker compose logs watchtower
```

If it reports "no labels", confirm `app` has `com.centurylinklabs.watchtower.enable=true` set in `compose.yaml`.

To skip a release:

```env
WATCHTOWER_ENABLED=false
WATCHTOWER_PROFILE=disabled
```

then `docker compose up -d`.

## Still stuck

Generate a diagnostics tarball: **Admin → Diagnostics → Download diagnostics**. Email it to support@qualitymate.com.au.
