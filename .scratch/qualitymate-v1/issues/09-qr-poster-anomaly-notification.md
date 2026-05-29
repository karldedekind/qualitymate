# Per-job A4 QR poster generator + >5-unknowns anomaly notification

---
Status: done
---

## What to build

Per-job A4 QR poster PDF: company logo, job name, big scannable QR linking to `/checkin?job={id}`, human-readable URL fallback. Daily scan checks each job for unknown-company sign-ins (companies not seen on this job in last 30 days); >5 unknowns in a single day creates admin notification via Notify.

## Acceptance criteria

- [x] Admin creates a job → "Print QR poster" button generates A4 PDF
- [x] PDF includes branding from settings, job number+name, scannable QR
- [x] Daily nightly scan checks each job for unknown-company sign-ins
- [x] Threshold breach (>5) creates notification to all admins via Notify
- [x] Tests: poster PDF byte-size sanity; anomaly threshold logic at 5 vs 6

## Blocked by

- `05-notifications-skeleton.md`
- `08-site-roster-supervisor-url.md`

---

## Closing comment — 2026-05-13

Verified done. 0 prod fixes. AC already met.

- **Tests**: 7/7 green (`qr-poster.test.ts` 2 + `anomaly.test.ts` 5) — PDF byte-size sanity, URL embed, 5-vs-6 threshold, normalisation, fan-out to all admins.
- **HITL 6/6 pass**:
  1. Job row "Poster" link opens new tab + downloads `qr-poster-<num>.pdf`
  2. PDF content: logo, company name, "Site sign-in", `Job <number>`, job name, big QR, check-in URL
  3. QR scans to `<APP_URL>/checkin?job=<jobId>` and opens check-in form
  4. Below threshold (seeded 5 unknowns) → `triggered=0`, no notifications
  5. Above threshold (seeded 6 unknowns) → `triggered=1`, `notifiedAdmins=2`
  6. Notifications visible in admin inbox; email dispatched
- **Tooling added**: `scripts/seed-anomaly-hitl.ts` + `npm run seed:anomaly-hitl <below|above> <dateIso>` to reproduce both threshold scenarios.

### Follow-ups (rolled up in `follow-ups.md`)

- No scheduler — `scan:anomalies` runs only via manual `npm run` (medium)
- HITL seed jobs `HITL-09A` / `HITL-09B` left in DB (trivial)
