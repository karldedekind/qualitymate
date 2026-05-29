# Admin Guide

Day-to-day operations for the admin role.

## Dashboard

`/dashboard` shows KPIs (open incidents, open actions, attendance today, on-time rate), a 12-month incident trend, category breakdown, top jobs, and an actions-by-status stack.

![Admin dashboard](images/admin-dashboard.png)

## Jobs

**Admin → Jobs**. Each job has a number, name, address, and active/inactive flag.

- Click **New job** to add one.
- Click a job to view its check-in roster, QR poster, and signed-off attendance.
- Toggle **Active** off to hide it from incident-reporting forms without deleting history.

### QR poster

Each job has a printable QR poster at `/admin/jobs/<id>/qr-poster`. Print on A4, laminate, fix to the site board.

![QR poster](images/qr-poster.png)

The QR encodes `${APP_URL}/checkin?job=<id>`. Scanning opens a check-in form on the worker's phone — no login required.

## Incidents

**Admin → Incidents**. Lists all incidents with status: pending review, open, closed.

Workflow:

1. Site staff submits via `/incidents/new` or QR-flow on phone.
2. Admin reviews — clicks **Suggest** for AI triage (when the Anthropic key is configured), then **Apply** or edits manually.
3. Set priority (low / medium / high / critical) and category (safety / quality / documentation / equipment / environment / other).
4. Either close immediately, or **Create action** to track corrective work.

![Admin review](images/admin-review.png)

## Actions

**Admin → Actions**. Tracks corrective and preventive actions.

- Each action has an owner, due date, and status (open, resolved, overdue).
- Overdue scans run nightly via `npm run scan:actions` and notify the owner.
- Owners resolve via `/actions/mine`.

## Meetings

**Admin → Meetings**. ISO 9001 management-review schedule.

1. **Schedule** — title, date/time, attendees. An `.ics` invite is emailed to attendees.
2. **Generate pack** — AI drafts agenda, summary, and trends. Edit as needed.
3. **Run meeting** — record attendance + apologies live or after.
4. **Draft minutes** — AI produces decisions + follow-ups; edit and lock.
5. **Sign-offs** — attendees visit `/meetings/sign/<id>` and sign on screen. Required before approval.
6. **Approve** — Director approves; minutes PDF + .ics are emailed to the configured distribution list.

![Meeting flow](images/meeting-flow.png)

## Users

**Admin → Users**. Invite, deactivate, reset passwords, change roles.

- Deactivating a user immediately invalidates their sessions.
- Admin password reset issues a one-time temporary password the user must change on first login.

## Settings

**Admin → Settings**. Branding, SMTP, AI, S3, MFA policy. Secret values (passwords, API keys) are encrypted-at-rest using `INSTALL_PASSPHRASE`.

## MFA

**Account → Security**. Each user can enable TOTP. Admins can mandate MFA for all admins via **Settings → MFA**. Recovery codes are shown once at enrolment — print them.

## Audit log

**Admin → Audit log**. Every state change records actor, action, before/after JSON. Filter by date, entity type, or actor. Export CSV from the same page.

## Data export

**Admin → Data export**. One-click ZIP of every CSV table, redacted settings, uploaded photos, and approved meeting PDFs. Rate-limited to once per 5 minutes per admin.

## Heartbeat & diagnostics

- **Heartbeat** — opt-in hourly ping to RIM Construction. Default off. No PII.
- **Diagnostics** — admin-only tarball with sanitised env, pg_stat snapshot, and last 5000 log lines. Send to RIM when reporting issues.

## Backups

**Admin → Backups**. List of nightly tarballs. Click to download. Run **Backup now** to take an extra one.

For restores see [Backup and Restore](backup-restore.md).
