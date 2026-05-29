# Notifications skeleton — bell icon + in-app + email + SMTP test send

---
Status: done
---

## What to build

`notifications` table: `id`, `user_id`, `type`, `entity_type`, `entity_id`, `body`, `read_at`, `created_at`. Notify module: `send(userId, event, payload)` fans out to in-app row + email; falls back to in-app only when SMTP unconfigured. Bell icon in header with unread count and dropdown of last 20. SMTP settings section with test-send button.

## Acceptance criteria

- [x] `notifications` table created via migration
- [x] Bell icon shows unread count; clicking opens dropdown of last 20 with mark-read on click
- [x] `Notify.send` writes in-app row immediately and queues email when SMTP configured
- [x] When SMTP not configured, in-app only — no error to caller
- [x] SMTP settings page accepts host/port/user/password (encrypted at rest); test-send button delivers a probe email and reports success/failure
- [x] Tests: fan-out behaviour, fallback path, SMTP test-send error surfacing

## Blocked by

- `02-settings-branding.md`

## Comments

### 2026-05-06 — implemented

- Schema: `notifications` table — migration `0003_notifications.sql`. Indexes on `(user_id, read_at)` and `(user_id, created_at desc)`
- Module `src/lib/notify.ts`: `send`, `unreadCount`, `recent`, `markRead`, `markAllRead`. `send` always writes in-app row first; if email payload provided AND SMTP configured AND target user not deactivated, calls `sendMail` and returns `emailQueued`/`emailError`. SMTP-not-configured path returns `emailQueued: false` with no error
- Module `src/lib/smtp.ts`: `readSmtpConfig`, `isConfigured`, `sendMail`, `testSend`, `_setTransportForTests` (mock seam at network boundary per PRD). Uses nodemailer; reads encrypted password via Settings module
- Settings: `smtp.host`, `smtp.port`, `smtp.user`, `smtp.password` (already secret), `smtp.from_email`, `smtp.secure`. Password preserved across save when field left blank
- Bell icon component on `BrandedHeader` for any signed-in user. Server fetches `unreadCount` + `recent(20)`; client dropdown handles open/close, mark-read on click, mark-all-read button. Server actions in `src/app/notifications/actions.ts` revalidate layout
- `/admin/settings` extended with SMTP section (host/port/user/password/from/secure) + "Send test email to {admin email}" button. Test outcome surfaced inline; both success and failure audited
- Wired `inviteUserAction` (issue 04) to call `sendMail` when SMTP configured. Falls back to copyable link when not. Audit row records `emailSent` boolean
- Tests (`tests/notify.test.ts`): in-app row written without email payload, SMTP-unconfigured fallback (no error to caller), JSON-transport delivery success, deactivated-user skip, markRead unread-count drop, markRead refuses cross-user, markAllRead user-scoped, testSend success, testSend transport error surfaced as error string, testSend with unconfigured SMTP returns "SMTP not configured"
- Verified: `npm run build` and `npx tsc --noEmit` both green
- Not verified locally: `npm test` (Docker not running on this machine)
- Deferred: per-user channel toggles (PRD: both channels for v1, no toggles); calendar `.ics` for meetings (issue 14/16)

### 2026-05-13 — HITL verified, closed

- Prod fix: `src/app/admin/settings/smtp-form.tsx` — added `autoComplete="off"` (form + non-secret fields) and `autoComplete="new-password"` (password). Browser autofill was silently overwriting SMTP fields with stored credentials on submit, causing saves to revert to stale values
- Test runs: `npm test -- notify` → 10/10 green
- HITL 1/4 bell + dropdown: pass (seeded 3 notifs via SQL, badge `3` → mark-read → mark-all → badge clears)
- HITL 2/4 SMTP-unconfigured fallback: pass (cleared `smtp.*` settings via SQL — no UI clear button yet, see follow-up; invite shows "SMTP unconfigured — copy the link below")
- HITL 3/4 settings + test-send: pass success path (gmail w/ app password → green "Sent test email" + `settings.smtp.test.success` audit) and failure path (`nonexistent.example.invalid` → red transport error surfaced + `settings.smtp.test.failure` audit)
- HITL 4/4 fan-out: pass ("Email sent" banner + real inbox delivery + `user.invite` audit row w/ `emailSent: true`)
- Gmail caveat: gmail SMTP rewrites the From header to the authenticated user, ignoring `smtp.from_email`. Not a product bug — gmail policy. Admins wanting a different From must configure "Send mail as" alias in their gmail account
- Follow-up: add a "Clear/Reset SMTP" button to the settings UI (admins cannot blank SMTP via the form today — required SQL during HITL)
