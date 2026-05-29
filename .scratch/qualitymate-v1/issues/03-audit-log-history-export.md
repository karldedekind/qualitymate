# Audit log history view + filterable CSV/PDF export

---
Status: done
---

## What to build

Per-entity History tab shows full timeline of create/update/delete events with before/after snapshot diff. Audit log export filterable by date range and entity type to CSV and PDF. Login successes and failures already appear in audit log (from foundation slice).

## Acceptance criteria

- [x] `/admin/audit-log` lists recent events with date-range and entity-type filters
- [x] Per-entity History route renders reverse-chronological event list with before/after diff
- [x] CSV export contains all selected events; opens cleanly in Excel
- [x] PDF export auditor-ready with branding from settings
- [x] `user_email_snapshot` survives soft-delete of user (audit row keeps email even after user deactivated)
- [x] Test: write sequence through central wrapper produces expected before/after diffs
- [x] Test: history-by-entity returns events in reverse chronological order

## Blocked by

- `01-foundation-tracer.md`

## Comments

### 2026-05-06 — implemented

- Audit lib extended (`src/lib/audit.ts`): `query(filters)` (date range + entity type + entity id + limit), `distinctEntityTypes()` for filter dropdown
- `/admin/audit-log` — list page with date-range + entity-type filters, 500-row cap, CSV/PDF export buttons preserve filter querystring
- `/admin/audit-log/[entityType]/[entityId]` — per-entity history, reverse chrono, before/after JSON pretty-printed side-by-side, IP + UA per row
- `/admin/audit-log/export.csv` — streams CSV (RFC 4180 quoting); audited as `audit.export.csv`
- `/admin/audit-log/export.pdf` — server-rendered PDF via `pdfkit`, branded header (company name + primary colour), filter summary, one block per event with truncated before/after; audited as `audit.export.pdf`
- Email snapshot survives soft-delete: column already denormalised; verified by test that deactivates user and re-reads history
- Admin nav extended with Audit log link
- Tests (`tests/audit.test.ts`): create+update diff sequence, query date-range filter, query entity-type filter, email snapshot post-deactivation, CSV quoting (commas + embedded quotes), PDF magic bytes (`%PDF`)
- Verified: `npm run build` and `npx tsc --noEmit` both green
- Not verified locally: `npm test` (Docker not running on this machine)
- Deferred: pretty diff (currently full JSON before/after side-by-side); structural diff highlighting can come later if auditors complain
- Deferred: pagination beyond 500 rows in UI — exports cover full window

### 2026-05-08 — HITL verified, closed

- Bug fix during HITL: `to` date filter excluded same-day events. `parseDate("YYYY-MM-DD")` parsed to midnight UTC, so `lte(ts, to)` dropped any event later that day. Fixed in 3 files (`src/app/admin/audit-log/page.tsx`, `export.csv/route.ts`, `export.pdf/route.ts`) — `to` now sets `setUTCHours(23,59,59,999)`
- Test runs: `npm test -- audit` → 6/6 green; `npm test` → 211/211 green (host vitest + testcontainers)
- HITL 1/5 list+filters: pass after to-date fix
- HITL 2/5 entity history: pass (used branding setting edited twice → before/after diff visible)
- HITL 3/5 CSV: pass (header + filter respected + JSON quoting intact)
- HITL 4/5 PDF: pass (branded header, filter summary, event blocks)
- HITL 5/5 email snapshot: pass (SQL: inserted user + audit row, deactivated user, confirmed `user_email_snapshot` retained in UI; cleanup removed test row)
- Unverifiable in scope: 500-row notice (insufficient seed data) — logic confirmed by code review (`page.tsx:140`)
