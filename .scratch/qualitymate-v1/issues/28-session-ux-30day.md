# 30-day session "remember me" UX polish

---
Status: done
---

## What to build

30-day session is the spec default. Ensure mobile users stay logged in across browser restarts. Cookie attributes correct (SameSite, Secure, HttpOnly). "You have been logged out" copy clear when session expires.

## Acceptance criteria

- [x] Session cookie set with 30-day expiry, `SameSite=Lax`, `Secure`, `HttpOnly`
- [ ] User stays logged in across mobile browser restarts (manual device check pending — iOS Safari + Android Chrome)
- [x] Session expiry shows clear "logged out, please sign in again" message and redirects to login
- [x] Test: cookie attributes set correctly; expiry rounding tolerance

## Blocked by

- `01-foundation-tracer.md`

## Comments

### 2026-05-06 — implementation

- `src/lib/auth.ts` — extracted `SESSION_MAX_AGE_SECONDS` (= `60*60*24*30` = 2,592,000) and `SESSION_UPDATE_AGE_SECONDS` (= 86,400; sliding-renew window is 1 day). Added a pure `sessionCookieAttributes(baseUrl)` helper returning `{ httpOnly: true, sameSite: "lax", secure: <https>, maxAge: SESSION_MAX_AGE_SECONDS, path: "/" }`. better-auth wired with `advanced.useSecureCookies` and `advanced.defaultCookieAttributes` set from the helper. `session.expiresIn` and `session.updateAge` now reference the named constants — single source of truth.
- `src/lib/auth-helpers.ts` — `requireUser` now redirects unauthenticated visitors to `/login?reason=expired` (was `/login`). The deactivated-account path keeps using `/login?error=deactivated`.
- `src/app/login/page.tsx` — accepts `searchParams.reason` / `searchParams.error`. Renders an amber `role="status"` banner ("You have been logged out. Please sign in again.") for `reason=expired` and a red `role="alert"` banner ("This account has been deactivated. Contact your administrator.") for `error=deactivated`.
- `tests/session-cookie.test.ts` — 6 cases: 30-day maxAge in seconds, sliding renew shorter than maxAge, HttpOnly + SameSite + path invariant across schemes, Secure off for `http://`, Secure on for `https://`, integer-second maxAge with explicit 1-second rounding tolerance per AC.

`secure` flips automatically based on `BETTER_AUTH_URL`. Local dev (`http://localhost:3000`) keeps the cookie usable; production (`https://qm.example.com`) gets the Secure flag without any extra config.

Mobile-browser-restart verification (iOS Safari + Android Chrome) is the one remaining manual step — depends on a real https deployment. The cookie config (`maxAge=2,592,000s`, persistent — *not* a session cookie because `maxAge` is set) is what mobile browsers honour for cross-restart persistence.

`npm run typecheck` clean. New test 6/6 pass; standalone-runnable suite up to 45 (39 + 6).
