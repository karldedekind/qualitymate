#!/bin/sh
set -a; . /etc/cron-env; set +a
cd /app
exec su-exec nextjs node node_modules/tsx/dist/cli.mjs scripts/backup.ts >> /app/data/backups/backup.log 2>&1
