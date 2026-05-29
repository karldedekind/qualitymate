# Site check-in validation — declarations, white card expiry, rate limit, privacy consent

---
Status: done
---

## What to build

Eight required declarations on the check-in form (text per PRD §Site check-in) — all must be ticked. White card expiry must not be in the past (rejected with specific error code `WHITE_CARD_EXPIRED`). Per-IP rate limit (20 submissions/hour — raised from PRD-original 10 during HITL 2026-05-13 per product decision). Privacy notice + explicit consent checkbox required before submit button enables. Missing signature rejected. Declaration text editable from admin settings.

## Acceptance criteria

- [x] All eight declarations rendered as required checkboxes (text per PRD)
- [x] Submission rejected when any declaration unchecked
- [x] Submission rejected when white card expiry is in the past, error code `WHITE_CARD_EXPIRED`
- [x] Submission rejected when signature is empty
- [x] Per-IP rate limit blocks the 21st submission within an hour (limit raised from 10 → 20 during HITL 2026-05-13)
- [x] Privacy notice + consent checkbox required before submit button enables
- [x] Declaration text editable from admin settings page
- [x] Unit tests per PRD's SiteCheckIn test list (declarations all-true succeeds, any-false rejected, expired-card rejected, missing-signature rejected, rate limit at 21st)

## Blocked by

- `06-jobs-categories-checkin-form-skeleton.md`

## Comments

### 2026-05-13 — HITL verified, closed

- Code already aligned with all 8 AC at start (validation logic landed during #06 implementation, see #06 closing note)
- Product change: per-IP rate limit raised from PRD's 10/hour to **20/hour** (constant `CHECKIN_RATE_LIMIT` in `src/lib/checkin.ts`; test renamed to "blocks the 21st submission within an hour"). AC text "11th blocked" therefore reads as "21st blocked" in current code
- Server enforcement: `submit()` rejects in order — SIGNATURE_MISSING → CONSENT_MISSING → DECLARATION_MISSING (any of 8) → INVALID expiry format → WHITE_CARD_EXPIRED (past) → RATE_LIMITED (per-IP, in-memory bucket via `src/lib/rate-limit.ts`)
- Client gate: `src/app/checkin/checkin-form.tsx` `canSubmit = allDeclared && consent && signatureDrawn && !pending` disables Submit button until satisfied. Controlled checkboxes — React re-syncs DOM `checked` to state on every commit, so naive DevTools `el.checked=false` bypass fails (button re-renders + form re-serialises with state-true). Server-side rejection paths are covered by unit tests, not realistic to bypass from a browser
- Declaration text editable from `/admin/settings` (settings-backed overrides via `getDeclarations`/`setDeclarations`; defaults fall back to PRD wording when blank)
- Test runs: `npm test -- checkin` → 17/17 green (8-decl happy path, each-decl-false rejection ×8, expired card, today-expiry accepted, missing signature, missing consent, 21st-IP rate limit, different-IP isolation, declaration defaults + override)
- HITL 1/6 client gate: pass (Submit disabled until all 8 decls + consent + signature; enables only when all three true)
- HITL 2/6 admin declaration editor: pass (edited `decl_whsmp` text via `/admin/settings`, reflected on public `/checkin` form)
- HITL 3/6 expired card rejected: pass (expiry `2020-01-01` → error banner, no row, audit row `site_attendance.rejected` with `code: WHITE_CARD_EXPIRED`)
- HITL 4/6 empty signature gate: pass (button stays disabled while signature pad empty; Clear button re-disables)
- HITL 5/6 rate limit: pass — temporarily set `limit: 20` → `3` to make HITL feasible in a single session, rebuilt container, verified 3 successful submits + 4th blocked with "Too many sign-ins" banner, then reverted `limit: 3` → `20` and rebuilt; unit tests still green at production value
- HITL 6/6 rejections audited: pass — `audit_log` table contains `site_attendance.rejected` rows for both `RATE_LIMITED` and `WHITE_CARD_EXPIRED` with `after` JSON carrying `code`, `jobId`, `jobNumber`
- Follow-up (UX, low): `/admin/audit-log` shows only Time/User/Action/Entity/IP columns and only links entity when `entityId` is present. Rejection rows have no entityId, so admins cannot see the rejection `code` from the UI — only via SQL or CSV export. Consider adding an inline "After" payload preview, an expandable row, or letting entityType-only rows drill into a type-filtered detail view
