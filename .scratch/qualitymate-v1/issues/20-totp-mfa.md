# TOTP MFA — per-admin opt-in + admin-level require-all-admins toggle

---
Status: ready-for-human
---

## What to build

Better-auth TOTP setup flow per admin. Admin-level setting can require MFA for all admins — when on, existing admins without TOTP are forced through setup on next login. Recovery codes generated and consumable once each.

## Acceptance criteria

- [x] Admin can enable TOTP from own settings; QR code + recovery codes shown
- [x] Login with TOTP-enabled account requires code after password
- [x] Admin-level "require MFA for all admins" toggle persists in settings
- [x] When required, admins without TOTP forced into setup on next login
- [x] Recovery codes work and burn after one use
- [x] Tests: setupMfa flow, login with code, recovery code one-shot

## Blocked by

- `02-settings-branding.md`

## Comments

### 2026-05-06 — implementation

**Approach:** custom RFC 6238 TOTP rather than the better-auth twoFactor plugin.
The plugin would force a deeper rewrite of our session/sign-in flow; a small
hand-rolled implementation slots in cleanly behind the existing better-auth
session model.

**Schema — `drizzle/0010_mfa.sql`**
- `user.totp_secret` (text), `user.totp_enabled_at` (timestamp), `user.totp_recovery_codes` (jsonb<string[]> of sha256 hashes; default `[]`).
- `session.mfa_verified_at` (timestamp). `session` is better-auth's table; the extra column is read-only as far as better-auth is concerned.
- `KNOWN_KEYS.MFA_REQUIRE_ALL_ADMINS` setting key.

**Library**
- `src/lib/totp.ts` — pure: `base32Encode/Decode`, `generateSecret(20)`, `hotp(secret, counter)` (RFC 4226), `totp(secretBase32, time)` (RFC 6238), `verifyTotp` with ±1-step window, `buildOtpauthUri({secret,account,issuer})`. No DB.
- `src/lib/mfa.ts` — DB orchestration:
  - `startEnrollment(userId, accountName, issuer)` issues secret + 10 recovery codes (12 hex chars). Plaintext recovery codes returned once; SHA-256 hashes stored. `totp_enabled_at` stays null until confirmation.
  - `confirmEnrollment(userId, code)` verifies with `verifyTotp` and sets `totp_enabled_at = now()`.
  - `verifyLogin(userId, code)` accepts a 6-digit TOTP or one of the recovery codes; matched recovery codes are removed from storage atomically (one-shot burn).
  - `markSessionVerified(sessionId)` stamps `session.mfa_verified_at`.
  - `disableMfa(userId)` clears secret + recovery codes + enabled flag.
  - `regenerateRecoveryCodes(userId)` issues 10 new codes and replaces all stored hashes.
  - `isMfaRequiredForAdmins()` / `setMfaRequired(value)` read/write the policy setting.

**Login flow**
- `src/app/login/actions.ts` — after `auth.api.signInEmail` succeeds, if `user.totp_enabled_at` is set → redirect to `/login/mfa`; else if user is admin and the require-all-admins policy is on but they have no TOTP → redirect to `/account/security/setup`.
- `src/app/login/mfa/{page,form,actions}.tsx` — code form. Submission calls `verifyLogin(user.id, code)`; on success, calls `markSessionVerified(session.id)` and redirects to `/dashboard`. Audits success / failure / recovery-consume.
- `src/lib/auth-helpers.ts` — `requireUser({ skipMfa? })` now also enforces:
  1. user with TOTP enabled but `session.mfa_verified_at` null → `/login/mfa`.
  2. admin without TOTP and policy = on → `/account/security/setup`.
  Setup pages and the verify page pass `skipMfa: true` to break the redirect loop.

**UI**
- `src/app/account/security/page.tsx` + `panel.tsx` (client) — start/confirm/disable/regenerate flows. QR rendered client-side via the existing `qrcode` package (no server-side image work). Recovery codes shown once, with regen warning. Plaintext secret shown for manual app entry as a fallback.
- `src/app/account/security/setup/page.tsx` — gate destination for the require-all-admins policy.
- `src/app/admin/settings/{mfa-form,mfa-actions}.tsx` — admin policy toggle wired into the existing settings page.

**Data export** updated to include the new `user.totp_*` columns and `session.mfa_verified_at` so backups/export round-trip correctly.

**Tests**
- `tests/totp.test.ts` (7 cases, runs without docker) — base32 round-trip, RFC 4226 Appendix D HOTP vectors (counters 0–9), RFC 6238 SHA-1 vector at T=59 → `287082`, ±1-step window acceptance + 2-step rejection, format-rejection, `buildOtpauthUri` shape. **All 7 pass standalone.**
- `tests/mfa.test.ts` (8 cases, gated on testcontainers) — start enrollment hashes recovery codes (plaintext absent from storage), confirm with valid code marks enrolment, confirm rejects bad code, verifyLogin(TOTP) preserves recovery count, verifyLogin(recovery) burns the code (second use returns `INVALID`), NOT_ENROLLED guard, disable clears all state, regenerate invalidates old codes, policy toggle round-trips.

`npm run typecheck` clean.
