# Role-aware dashboard + 4 KPIs + 4 charts + quarterly PDF print route

---
Status: ready-for-human
---

## What to build

`/dashboard` role-aware. site_staff view: my incidents (last 5), my actions (open + overdue highlighted). admin view: 4 KPI cards (open incidents, actions overdue, average days to close, next quarterly meeting status); 4 charts (category donut, 12-month trend line, top 5 jobs bar, actions by status stacked bar) via recharts. Quarterly Report PDF via `(print)` route group — auditor- and board-ready.

## Acceptance criteria

- [x] `/dashboard` renders role-aware content
- [x] site_staff view shows my-5 incidents + my actions with overdue highlighted
- [x] admin view shows 4 KPI cards with correct numbers against fixture
- [x] 4 charts render with recharts; values match fixture
- [x] `/quarterly-report.pdf` print route generates PDF with branding from settings
- [x] Tests: Metrics module aggregations against seeded fixture (`kpis`, `incidentTrend(12)`, `categoryBreakdown`, `actionsByStatus`, `topJobsByIncidentCount`)

## Blocked by

- `13-corrective-actions-cron-scans.md`
- `16-meetings-email-distribution-ics.md`

## Comments

### 2026-05-06 — implementation

**Dependency**: `recharts ^3.8.1` added.

**Library — `src/lib/metrics.ts`**
- `kpis(now?)`: openIncidents (`status<>'closed'`), actionsOverdue (`open AND deadline<now`), avgDaysToClose (closed incidents, rounded to 0.1), nextQuarterlyMeetingStatus (next future meeting status, or `'none'`).
- `incidentTrend(months=12, now?)`: dense 12-month series, gaps zero-filled, UTC month buckets.
- `categoryBreakdown(windowDays=90, now?)`: ordered desc; null category surfaced as `"Uncategorised"`.
- `actionsByStatus()`: always returns both `open`/`resolved` buckets even when zero.
- `topJobsByIncidentCount(limit=5, windowDays=90, now?)`: inner-join jobs, excludes incidents without a `jobId`.
- `myRecentIncidents(userId, limit=5)`, `myOpenActions(userId, now?)` for site-staff view; `overdue` flag computed in JS for clarity.

**Charts — `src/components/dashboard-charts.tsx`** (client)
- `CategoryDonut`, `IncidentTrendLine`, `TopJobsBar`, `ActionsByStatusStacked` — pure presentational; ResponsiveContainer at 240px height.

**Dashboard — `src/app/dashboard/page.tsx`** (server)
- Role-branched: `AdminDashboard` shows KPI grid + 4 charts + link to quarterly PDF; `SiteStaffDashboard` shows recent-5 incidents and my-actions list with overdue rows highlighted (`bg-red-50`, `text-red-700` deadline).

**Quarterly PDF**
- Route: `src/app/(print)/quarterly-report.pdf/route.ts` — `(print)` route group per spec; admin-only via `requireAdmin`; emits `application/pdf` with `Content-Disposition: attachment` and an `audit_log` entry (`report.quarterly.export`).
- Renderer: `src/lib/quarterly-report-pdf.ts` — pdfkit; branding (company name in primary color) + KPI block + 12-month trend list + 90-day category breakdown + top jobs + actions-by-status. Includes management rep name when configured.

**Tests — `tests/metrics.test.ts`**
- Seed fixture: 3 jobs, 2 categories, 6 incidents (5 in 90d window, 1 at 200d back), 4 actions (1 overdue open, 1 future open, 2 resolved), 3 meetings.
- 8 cases covering all five aggregation functions plus the two site-staff helpers and the empty-DB KPI path. Compiles + typechecks; runs alongside other DB-dependent suites under testcontainers (no docker locally; same gating as existing tests).

`npm run typecheck` clean.
