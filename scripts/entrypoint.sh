#!/bin/sh
set -e

# Dump env for cron jobs (crond does not inherit container environment)
printenv | grep -E '^(DATABASE_URL|APP_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL|NODE_ENV|UPLOADS_DIR|WEEKLY_BACKUP_RECIPIENT)=' > /etc/cron-env
chmod 600 /etc/cron-env

# Start cron daemon in background
crond -b -l 8

# Bind-mounted data dirs inherit host ownership, which may not match the
# nextjs user. Fix ownership at runtime (we are still root here) so the app
# can create upload/backup subdirs. See uploads.ts mkdir + EACCES on branding.
for d in /app/data/uploads /app/data/backups /app/data/restore; do
  [ -d "$d" ] && chown -R nextjs:nodejs "$d"
done

echo "[entrypoint] running migrations…"
su-exec nextjs node node_modules/tsx/dist/cli.mjs src/db/migrate.ts

echo "[entrypoint] migrations done. starting server…"
exec su-exec nextjs node server.js
