# Jobs + categories + public site check-in form skeleton

---
Status: done
---

## What to build

Jobs CRUD (admin). Categories table seeded on first migration with Q×20 (quality) + E×12 (environment) per PRD. Public `/checkin` form skeleton: global job dropdown (job number + name), basic fields (full name, mobile, company, trade dropdown of QLD trades + Other, emergency contact name + phone, white card number/expiry, planned departure, drawn signature via signature_pad). Submission persists to `site_attendances`. Thank-you confirmation page on success. **Validation logic (declarations, white-card-expiry, rate limit, consent) lands in next slice (07).**

## Acceptance criteria

- [x] Admin can create/edit/delete jobs; jobs list shows job number + name
- [x] Categories table seeded with Q×20 + E×12 on first migration run
- [x] `/checkin` is publicly reachable without auth
- [x] Job dropdown lists all active jobs (number + name)
- [x] Form fields capture all mandatory data; signature drawn on canvas via signature_pad
- [x] Submission persists row in `site_attendances` with `signed_in_at` timestamp
- [x] Thank-you page renders on success
- [x] Audit log records each submission

## Blocked by

- `02-settings-branding.md`

## Comments

### 2026-05-13 — HITL verified, closed

- Code already aligned with all 8 AC at start of session — no prod fixes needed for #06 scope
- Note: validation logic (declarations gate, white-card-expiry, rate limit, consent) scoped to issue #07 was already implemented in `src/lib/checkin.ts` and used by `src/app/checkin/actions.ts`. #07 may end up a no-op verification pass
- Schema: migration `0004_jobs_categories_attendances.sql` creates `jobs`, `categories` (seeded Q01–Q20 + E01–E12), `site_attendances`
- Module `src/lib/jobs.ts`: `listJobs`, `findJobById`, `findJobByNumber`, `createJob`, `updateJob`, `activateJob`, `deactivateJob`
- Module `src/lib/checkin.ts`: `QLD_TRADES` (24 incl. Other), `DECLARATION_KEYS` × 8, `DECLARATION_DEFAULTS`, `getDeclarations`/`setDeclarations` (settings-backed overrides), `submit` (returns typed `SubmitResult` with codes WHITE_CARD_EXPIRED / DECLARATION_MISSING / CONSENT_MISSING / SIGNATURE_MISSING / RATE_LIMITED / INVALID), `persistSignature` writes PNG to `uploadsRoot()/site_attendance/<id>/signature.png`
- Admin pages: `/admin/jobs` (active + inactive sections), `/admin/jobs/new`, `/admin/jobs/[id]/edit`. Server actions audit `job.create` / `job.update` / `job.activate` / `job.deactivate`
- Public `/checkin`: server component reads brand + active jobs + declarations, renders `CheckInForm` (signature_pad canvas). Submission posts to `submitCheckInAction` which writes `site_attendance.create` audit on success, `site_attendance.rejected` on failure
- Thank-you page at `/checkin/thanks` with branded header + "Sign in another person" link
- Test runs: `npm test -- checkin migrations` → 21/21 green (17 checkin + 4 migrations, including 0004 idempotency)
- HITL 1/6 admin create: pass (`J-TEST-06` created, audit `job.create` recorded, row visible under Active)
- HITL 2/6 edit + deactivate/activate: pass (name edit persisted, row moved Inactive↔Active per toggle)
- HITL 3/6 public reach + dropdowns: pass (`/checkin` loads without auth in incognito, job dropdown lists `J-TEST-06`, trade dropdown shows 24 QLD trades incl. Other)
- HITL 4/6 valid submission + thanks: pass (full form + signature canvas → redirect to `/checkin/thanks` green ✓)
- HITL 5/6 persisted to DB + disk: pass (row `pI5JCviIIqw5zmdE` in `site_attendances` with correct fields + `signature_path=site_attendance/pI5JCviIIqw5zmdE/signature.png`, PNG file confirmed at `/app/data/uploads/site_attendance/pI5JCviIIqw5zmdE/signature.png` 8682 bytes)
- HITL 6/6 audit log: pass (`site_attendance.create` row visible in `/admin/audit-log` with entity id + jobNumber/fullName/companyName/trade payload)
