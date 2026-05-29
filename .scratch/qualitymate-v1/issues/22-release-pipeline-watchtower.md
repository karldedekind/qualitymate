# Release pipeline — GHCR + GH Actions + canary tags + boot-time migrations + migration test CI + Watchtower bundled

---
Status: ready-for-human
---

## What to build

GitHub Actions builds and tags Docker images on push to `main`: `:1` (rolling latest 1.x), `:1-stable-rc` (RIM canary), `:1-stable` (paying customers). Watchtower bundled in compose with default monthly schedule, customer-disablable via `.env`. Drizzle migrations run on container boot before HTTP server accepts requests; failure blocks startup. Migration test CI job spins up fresh Postgres, runs every migration in order from v1, seeds fixture, asserts schema snapshot. Security CVE patches skip canary week and release directly to `:1-stable` with explicit confirmation step.

## Acceptance criteria

- [x] Push to `main` builds and tags `:1` and `:1-stable-rc` to GHCR
- [x] Manual workflow promotes `:1-stable-rc` → `:1-stable` after canary week
- [x] Container boot runs migrations; HTTP server only starts on success; failure logs and exits non-zero
- [x] Watchtower in compose; `WATCHTOWER_ENABLED=false` (with profile flip) disables
- [x] Migration test CI job runs on every PR; failure blocks merge
- [x] CVE-patch workflow tags `:1-stable` directly, requires manual confirmation
- [ ] Public registry pull works without auth (one-time manual step: mark GHCR package Public after first push)

## Blocked by

- `01-foundation-tracer.md`

## Comments

### 2026-05-06 — implementation

- `.github/workflows/build.yml` — push to `main` (and `v1.*` tags) triggers buildx multi-arch (linux/amd64, linux/arm64) build to GHCR `ghcr.io/<repo>:1`, `:1-stable-rc`, `:sha-<sha>`. GHA cache. `${IMAGE_NAME,,}` lowercases owner/repo. Comment notes the one-time "make package public" step required for unauth pulls.
- `.github/workflows/promote.yml` — `workflow_dispatch` only. Requires `inputs.confirm == "promote"` (job-level `if:` gate). Uses `docker buildx imagetools create` to retag the `:1-stable-rc` manifest to `:1-stable` without rebuild — preserves digest, keeps multi-arch.
- `.github/workflows/cve-patch.yml` — `workflow_dispatch` with `confirm == "ship-cve"` and `reason` input. Builds and pushes `:1-stable`, `:1`, `:cve-<sha>` from the current ref, skipping `:1-stable-rc`. Annotates the run with the CVE reason.
- `.github/workflows/test.yml` — runs on PR + push to `main`. Steps: checkout → Node 22 → `npm ci` → `npm run typecheck` → `npm test`. The migrations test (testcontainers Postgres) runs as part of `npm test`, so failure blocks merge. Branch protection setup is the customer's one-time GitHub config.
- `tests/migrations.test.ts` — boots a fresh `postgres:16-alpine` testcontainer, applies every migration in `drizzle/` via `runMigrations`, then asserts (a) every expected public table exists, (b) `__migrations` rows are sorted in filename order and start at `0000_`, (c) re-running `runMigrations` is a no-op (returns `[]`), (d) seeding a `settings` row round-trips through the live schema. Skipped locally without Docker; runs in CI.
- `compose.yaml`:
  - `app` now uses `image: ${APP_IMAGE:-ghcr.io/rimconstruction/qualitymate:1-stable}` while keeping `build: .` for local dev. Labelled `com.centurylinklabs.watchtower.enable=true` so Watchtower only touches the app container, not Postgres.
  - New `watchtower` service (`containrrr/watchtower:latest`) gated by `profiles: [${WATCHTOWER_PROFILE:-watchtower}]`. Default profile name `watchtower` → service starts. To disable, customer sets `WATCHTOWER_PROFILE=disabled` (any value not in active profiles) plus the documented `WATCHTOWER_ENABLED=false`. `WATCHTOWER_LABEL_ENABLE=true` scopes updates to labelled containers. Schedule `${WATCHTOWER_SCHEDULE:-0 0 4 1 * *}` = 04:00 UTC on the 1st of each month (six-field cron incl. seconds, per Watchtower's format). Mounts `/var/run/docker.sock` — required for self-update.
- `.env.example` — `APP_IMAGE`, `WATCHTOWER_ENABLED`, `WATCHTOWER_PROFILE`, `WATCHTOWER_SCHEDULE` documented with disable instructions.
- Boot-time migration gate: `scripts/entrypoint.sh` already uses `set -e` and runs `tsx src/db/migrate.ts` before `exec node server.js`. `src/db/migrate.ts` calls `process.exit(1)` on failure, propagating non-zero. No change needed beyond verification.

Outstanding manual step: after the first GHA build pushes the package to GHCR, the repo admin must visit the package page → Settings → Change visibility → Public. Until then, pulls require `docker login ghcr.io`. This is a one-time GitHub UI action; documented in `.env.example` and the build workflow header comment.

`npm run typecheck` clean. Standalone-runnable tests still pass (31 across dictation, ics, totp, backup-retention).
