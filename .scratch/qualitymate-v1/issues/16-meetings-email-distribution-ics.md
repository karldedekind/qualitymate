# Meetings — emailed approved minutes + .ics calendar invite

---
Status: done
---

## What to build

On director approval, approved minutes PDF auto-emails to attendees + admin-defined distribution list. `.ics` attached to meeting schedule notifications so attendees can drop the meeting in their calendars.

## Acceptance criteria

- [x] Approval triggers email send with PDF attachment to attendees + distribution list
- [x] Distribution list editable per-meeting and as default in settings
- [x] Meeting schedule notifications include `.ics` attachment that imports correctly into common clients
- [x] Email failure logs to audit log; does not roll back approval
- [x] Test: email content/attachment shape, .ics validity (RFC 5545 minimal compliance)

## Blocked by

- `15-meetings-signoffs-approval.md`

## Comments

### 2026-05-06 — implementation

Wired approval-triggered minutes distribution + schedule .ics notifications.

**Schema/migrations**
- `drizzle/0009_meeting_distribution.sql`: `meetings.distribution_list` (`jsonb`, default `[]`) and `meetings.distributed_at` (`timestamp`).
- `KNOWN_KEYS.MEETING_DISTRIBUTION_LIST` (`meetings.default_distribution_list`) — settings-level default.

**Library code**
- `src/lib/ics.ts`: pure RFC 5545 generator. CRLF, `escapeText`, `formatUtc` (`YYYYMMDDTHHMMSSZ`), `foldLine` (≤75 octets, UTF-8 safe), VCALENDAR/VEVENT envelope with UID/DTSTAMP/DTSTART/DTEND/SUMMARY/LOCATION/ORGANIZER/ATTENDEE.
- `src/lib/meetings-pdf.ts`: pdfkit-based minutes PDF (branding, attendees, decisions, follow-ups, notes, signoffs).
- `src/lib/smtp.ts`: `SendMailInput` now accepts `to: string | string[]`, `attachments`, and a convenience `ics` field that adds a `text/calendar; method=PUBLISH` attachment.
- `src/lib/meetings.ts`:
  - `parseDistributionList`, `getDefaultDistributionList`, `setDefaultDistributionList`, `setMeetingDistributionList`.
  - `resolveRecipients(meeting)` — attendees-with-email ∪ per-meeting list ∪ default list, deduped lowercase, attendees-first stable order.
  - `distributeMinutes(id)` — only for `approved`; renders PDF via `getBranding`, sends via `sendMail`, marks `distributedAt` on success. Returns ok+skipped (`SMTP_OFF` / `NO_RECIPIENTS`) or `SEND_FAILED`.
  - `notifySchedule(id, organizerEmail)` and `buildScheduleIcs` — schedule-time invite with `.ics` to attendees with email (1-hour default duration).

**Server actions** (`src/app/admin/meetings/actions.ts`)
- `scheduleMeetingAction` now calls `notifySchedule` post-create and audit-logs `meeting.schedule.notify` / `…notify_skipped` / `…notify_failure`.
- `approveMeetingAction` calls `distributeMinutes` after `record("meeting.approve")` succeeds and audit-logs `meeting.distribute`, `meeting.distribute.skipped`, or `meeting.distribute.failure`. Approval is **not** rolled back on send failure.
- New: `saveMeetingDistributionAction`, `saveDefaultDistributionAction`.

**UI**
- `src/app/admin/meetings/[id]/editors.tsx`: `DistributionEditor` (per-meeting, locked once approved, shows inherited default).
- `src/app/admin/meetings/[id]/page.tsx`: renders `DistributionEditor` and `distributedAt` line.
- `src/app/admin/settings/distribution-form.tsx` + `…/settings/page.tsx`: default distribution list editor.

**Tests**
- `tests/ics.test.ts` — 8 cases: envelope, CRLF, UTC formatting, UID/SUMMARY, escaping, ORGANIZER/ATTENDEE, line folding ≤75 octets, helper behaviour. All pass standalone.
- `tests/meeting-distribution.test.ts` — `parseDistributionList` hardening; `resolveRecipients` merge order; `distributeMinutes` shape (To list, PDF magic header, content type), `SMTP_OFF` skip, `NOT_APPROVED` reject, send failure leaves `status='approved'` and `distributedAt=null`, success sets `distributedAt`; `notifySchedule` produces `text/calendar` attachment with valid VEVENT body. Requires testcontainers/Docker (same as other integration tests in repo).

`npm run typecheck` clean.

### 2026-05-25 — HITL pass

All ACs verified. One bug found and fixed during HITL:

**Bug:** `issueSignoffsAction` built signoff URLs but voided them — no email sent to attendees. Fix: added `notifySignoffs(meeting, issued, appUrl)` to `src/lib/meetings.ts`; sends individual email per attendee with their personal token link. Audit-logs `meeting.signoff.notify` / `…notify_skipped` / `…notify_failure`.

**Clarification confirmed:** Signoff emails go to meeting attendees only (personal tokens). Distribution list = approved-minutes PDF recipients only. Working as intended.
