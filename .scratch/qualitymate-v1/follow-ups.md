# Follow-ups

Rollup of non-blocking items logged during HITL of closed issues. Authoritative detail lives in each issue's closing comment — this file is an index for visibility. Status: `open` until addressed (then strike through and link to the resolving issue / commit).

| Source | Item | Severity | Status |
|--------|------|----------|--------|
| #05 | Clear/Reset SMTP button in `/admin/settings` (admins currently need SQL to blank SMTP config) | low | open |
| #07 | `/admin/audit-log` UI has no After-payload column and no drill-down for rejection rows without `entityId` — admins must use SQL or CSV export to see the rejection `code` | low (UX) | open |
| #08 | Other `datetime-local` inputs likely share the UTC-misinterpretation risk fixed in roster. Audit candidates: meetings scheduling, incident time inputs. Apply client-side `new Date(localStr).toISOString()` conversion before submit | medium | open |
| #08 | `src/app/admin/jobs/[id]/poster.pdf/route.ts` builds `content-disposition` filename from `result.filename` — same non-Latin-1 risk as the roster CSV em-dash 500. Sanitize and add RFC 5987 `filename*` fallback | medium | open |
| #08 | `RotateTokenButton` — add inline "Copy" button next to the generated supervisor URL `<code>` block for one-click clipboard copy | low (UX) | open |
| #08 | Test data hygiene: job has `number = "Test Job 06 — edited"` and `name = "Test Job 06"` — looks swapped from #06's intended edit. Clean up if kept | trivial | open |
| #09 | No scheduler wired — `scan:anomalies` runs only via manual `npm run`. Wire to cron (host crontab, k8s CronJob, or in-app scheduler) for true "nightly" behaviour | medium | open |
| #09 | HITL seed jobs `HITL-09A` / `HITL-09B` and 11 sign-ins left in DB after HITL. Delete or keep as fixtures | trivial | open |
| #10 | Corrective actions section + Create action form still shown on closed incidents (`src/app/admin/incidents/[id]/page.tsx:116`). Gate `<CreateActionForm>` behind `incident.status !== 'closed'` so closed incidents are read-only for new actions | low (UX) | open |
