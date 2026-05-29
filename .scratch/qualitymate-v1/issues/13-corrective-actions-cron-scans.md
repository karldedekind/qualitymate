# Corrective actions + cron-driven due-soon/overdue scans + notifications

---
Status: done
---

## What to build

Actions module: `create(input)`, `assign(id, userId)`, `resolve(id)`. Each action has assignee, deadline, status. Cron runs hourly: `dueSoonScan()` returns actions due within 3 days and not yet resolved; `overdueScan()` returns past-deadline and not yet resolved. Both call Notify with event payloads. Site staff sees own assigned actions and can mark own resolved.

## Acceptance criteria

- [ ] Admin creates action linked to incident; assigns user; sets deadline
- [ ] `/actions/mine` shows actions assigned to current user
- [ ] User can mark own action resolved; admin can mark anyone's
- [ ] Cron job runs `dueSoonScan` and `overdueScan` hourly
- [ ] Due-soon (3-day) and overdue events fan out via Notify with correct payload shape
- [ ] No double-notify for same event on consecutive scans
- [ ] Tests: scan correctness at boundary days, payload shape, double-notify suppression

## Blocked by

- `05-notifications-skeleton.md`
- `10-incidents-manual-flow.md`
