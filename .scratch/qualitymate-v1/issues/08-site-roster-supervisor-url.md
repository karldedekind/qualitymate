# Daily roster + supervisor token URL + filters + CSV + print + currently-on-site count

---
Status: done
---

## What to build

Admin daily roster per job showing full name, company, trade, planned departure, white card status. Filter by trade or company. CSV export of filtered rows. Print-friendly view. Per-job public read-only roster URL with rotatable token. "Currently expected on site" count derived from `now BETWEEN signed_in_at AND planned_departure_at`.

## Acceptance criteria

- [x] `/admin/roster?job=X&date=Y` shows daily roster for job + date
- [x] Trade and company filters narrow visible rows
- [x] CSV export contains filtered rows with all displayed columns
- [x] `?print=1` renders single-column print-friendly version
- [x] Per-job public URL `/roster/{jobId}?token=...` shows today's roster only; token rotatable from admin
- [x] "Currently expected on site" count is live and per-job
- [x] Tests: roster filter math, currently-on-site math at boundary times

## Blocked by

- `06-jobs-categories-checkin-form-skeleton.md`

## Comments

### 2026-05-13 — HITL verified, closed

- 4 prod fixes during this session (3 cross-cutting beyond #08 scope, surfaced via roster):

  1. **Timezone display** — `src/app/admin/roster/page.tsx`, `src/app/roster/[jobId]/page.tsx` rendered timestamps as `toISOString().slice(11, 16)` (UTC). Admin in Brisbane saw times shifted ~10h. Created new `src/components/local-time.tsx` client component using `useState`+`useEffect` (deferred render after mount) so SSR shows `—` and client replaces with `toLocaleTimeString` in browser TZ. Swapped both pages + the `?print=1` print branch. Initial attempt with `suppressHydrationWarning` did not work — React skipped the client-side replacement, so the deferred-effect approach was required
  2. **Check-in submission stored planned departure in UTC** — `src/app/checkin/checkin-form.tsx`'s `<input type="datetime-local">` sends a naive string like `2026-05-13T23:34`. Server's `new Date(...)` in a UTC container parsed it as UTC, so a Brisbane operator entering 23:34 ended up with 23:34 UTC in DB (= 09:34 next-day Brisbane). Fixed by converting in `onSubmit`: `formData.set("plannedDeparture", new Date(planned).toISOString())` — browser knows its TZ, sends proper ISO. (Cross-cutting: any other `datetime-local` input in the app has the same risk — see follow-up below)
  3. **CSV export 500 error from em dash in filename** — `src/app/admin/roster/export.csv/route.ts` interpolated `job.number` directly into the `content-disposition` header. The test job had `number = "Test Job 06 — edited"` (em dash, char 8212) which violates the Latin-1 ByteString requirement for HTTP headers → `TypeError`. Fixed by stripping non-ASCII into an ASCII slug for the legacy `filename=` part and adding RFC 5987 `filename*=UTF-8''<percent-encoded>` for the original Unicode name. Roster tests 7/7 still green
  4. **CSV time format** — per user request, switched roster CSV from ISO UTC `Z` to ISO with Brisbane offset `+10:00` for human readability while staying machine-parseable. Hardcoded `Australia/Brisbane` via new `formatIsoWithOffset` helper using `Intl.DateTimeFormat` `timeZoneName: "shortOffset"`. CSV header columns unchanged; only the `signed_in_at` and `planned_departure_at` value formats changed
  5. **Admin print chrome leak** — `/admin/roster?print=1` rendered the print-friendly table but it was still wrapped by `src/app/admin/layout.tsx`'s `BrandedHeader` + sidebar nav, so Cmd+P printed all of it. Added `print:hidden` Tailwind classes to the header + nav and `print:block print:max-w-none print:px-0 print:py-0` to the layout grid so any admin page now prints clean. The `?print=1` route's separate single-column branch continues to give the cleanest preview

- Test runs: `npm test -- roster` → 7/7 green twice (before CSV format change + after). Coverage: date scoping, trade/company filter, on-site boundary inclusivity, white card status thresholds, token rotate-invalidates-prior, empty token rejection, CSV escape + header
- HITL 1/6 admin roster renders: pass (after fixes 1+2 above — 3 sign-ins shown with local Brisbane times for both signed-in and planned-departure columns, summary cards correct)
- HITL 2/6 trade + company filter: pass (single + combined filters narrow visible rows; "X before filters" total preserved)
- HITL 3/6 CSV export: pass (after fixes 3+4 — file downloads cleanly, ISO+offset times, escaped quotes, filename slug ASCII-safe)
- HITL 4/6 print view: pass (after fix 5 — Cmd+P from `?print=1` page produces clean single-column table with no admin chrome)
- HITL 5/6 public supervisor URL + rotate: pass (URL generated, opens in incognito with read-only roster, rotation invalidates old token returning "Roster unavailable", new token works). Minor: no inline copy button — URL shown in `<code>` block, manual copy required. Branded heading shows configured company name from #02 settings as expected
- HITL 6/6 currently-on-site count: pass (forced one row's `planned_departure_at` into the past via SQL; "Currently expected on site" dropped by 1 while "Sign-ins (date)" total unchanged on both admin + public pages)

- Follow-ups logged (not blocking #08):
  - Other `datetime-local` inputs in the codebase carry the same UTC-misinterpretation risk as fix #2. Audit and apply the same client-side `toISOString()` conversion where applicable (likely candidates: meetings scheduling, incident time inputs)
  - `src/app/admin/jobs/[id]/poster.pdf/route.ts` builds its `content-disposition` filename from `result.filename` (likely derived from `job.number`/`job.name`). Same non-Latin-1 risk as fix #3 — sanitize there too
  - `RotateTokenButton`: add an inline "Copy" button next to the generated URL `<code>` block for one-click clipboard copy. Currently admin selects + copies manually
  - Job in test data has `number = "Test Job 06 — edited"` and `name = "Test Job 06"` — looks swapped from #06's intended edit. Not a bug here but a data-quality issue to clean up if the user keeps that job around
