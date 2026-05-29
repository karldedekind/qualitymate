# User management — invite, deactivate, role assignment, admin password reset

---
Status: done
---

## What to build

Admin page lists users. Invite by email creates inactive user + single-use invite token; copyable link shown when SMTP unconfigured. Deactivate sets `deactivated_at` without deleting history (audit trail preserved). Role picker (admin/site_staff) on each user. Admin can reset another user's password directly — sets a temporary password that target must change on first login; all existing sessions for the target invalidated.

## Acceptance criteria

- [x] `/admin/users` lists active and deactivated users separately
- [x] Invite by email sends through SMTP; copyable link shown as fallback when SMTP not configured
- [x] Invite token is single-use and expires
- [x] Deactivated user cannot log in; their audit history remains intact
- [x] Role picker persists; permission gate enforces `requireRole`
- [x] Admin password reset invalidates target's existing sessions and forces password change on next login
- [x] Tests: `inviteUser` creates inactive user + token; `adminResetPassword` invalidates sessions

## Blocked by

- `02-settings-branding.md`
- `05-notifications-skeleton.md`

## Comments

### 2026-05-06 — implemented (SMTP send deferred to issue 05)

- Schema: `user.must_change_password` boolean, `invite` table with `id, email, role, token, expires_at, used_at, invited_by` — migration `0002_user_management.sql`
- Module `src/lib/users.ts`: `inviteUser`, `findInviteByToken`, `acceptInvite`, `deactivateUser`, `reactivateUser`, `setRole`, `adminResetPassword`, `clearMustChangePassword`, `listUsers`, `findUserById`
- Invite tokens: 32-byte URL-safe base64, 7-day TTL, single-use (rejected if `used_at != null` or `expires_at < now`)
- `/admin/users` lists active and deactivated users in separate sections; per-row inline role picker, deactivate/reactivate buttons, reset-password button
- Self-deactivation guard: admin cannot deactivate themselves
- Invite flow: admin enters email + role → server action returns copyable link displayed in client UI. SMTP send hook deferred (issue 05) — link is the fallback today and will remain the fallback when SMTP is unconfigured
- `/invite/[token]` accept page: validates token, takes name + password, creates user via Better-auth, applies invited role, marks invite used. Redirects to login
- Admin password reset: hashes a 12-char temp password via `auth.$context.password.hash`, writes to credential `account` row (insert if missing), deletes all sessions for target, sets `must_change_password=true`. Temp password shown once to admin via UI banner
- Login gate: rejects deactivated users with explicit error (audited as `login.deactivated`); after success, redirects to `/change-password` if flag set
- `/change-password` route forces a fresh password via Better-auth `changePassword` API, clears flag, redirects to dashboard
- Permission helpers in `src/lib/auth-helpers.ts`: `requireUser` (also enforces deactivation + must-change gate), `requireRole(role)`, `requireAdmin`, `can(user, capability)`
- Tests (`tests/users.test.ts`): invite creates token and no user, acceptInvite consumes token + creates active user, used token rejected, expired token rejected, deactivateUser zeroes sessions but preserves audit history, setRole changes role, adminResetPassword returns temp pw + deletes sessions + sets flag, temp password authenticates via Better-auth + old password fails
- Verified: `npm run build` and `npx tsc --noEmit` both green
- Not verified locally: `npm test` (Docker not running on this machine)
- Deferred: SMTP send in `inviteUserAction` (issue 05) — when SMTP module exists, call `notify.send(email, 'invite', {link})`. Fallback link remains. PRD specifies both channels for invites

### 2026-05-08 — HITL verified, closed

- SMTP send already wired in `actions.ts:39-51` (uses `@/lib/smtp` `sendMail` + `isConfigured`). Fallback link path also intact when SMTP unconfigured. Issue 05 may further enhance; baseline works
- Test runs: `npm test -- users` → 8/8 green
- HITL 1/6 list active+deactivated: pass
- HITL 2/6 invite + accept: pass (created `tester@example.com`, accepted via fallback link, login succeeded)
- HITL 3/6 single-use + expiry: pass (re-used link rejected; SQL-expired token rejected)
- HITL 4/6 deactivate blocks login: pass (login error "Account is deactivated", audit history preserved)
- HITL 5/6 role picker + gate: pass (admin role grants /admin/users; site_staff redirects to /dashboard)
- HITL 6/6 admin reset: pass (sessions invalidated, old pw rejected, temp pw forces /change-password, new pw works thereafter)
- No prod fixes needed during HITL
