# Settings store + white-label branding + management representative

---
Status: done
---

## What to build

Settings module exposing `get(key)`, `set(key, value)`, `getCached()`. Encryption-at-rest for secret-marked keys using a key derived from an installation passphrase env var. Branding fields editable from admin settings page: company name, short name, logo upload, primary colour. ISO management representative recorded as a setting (named admin user reference) — covers ISO 9001 clause 5.3 evidence. Login page, app header, email templates and PDFs read cached settings at request time.

## Acceptance criteria

- [x] `settings` table with k/v + encrypted column for secret-marked keys
- [x] Admin settings page lists branding section with editable fields
- [x] Logo upload, colour picker, name fields persist; cache invalidates on write
- [x] Login page shows current company name and logo
- [x] Header reflects branding live without rebuild
- [x] Management representative dropdown selects from existing admins; persists; appears on quarterly PDF
- [x] Encrypted settings round-trip: read decrypts to plaintext; ciphertext != plaintext at rest
- [x] Unit tests for `get`/`set`/`getCached` and cache invalidation

## Blocked by

- `01-foundation-tracer.md`

## Comments

### 2026-05-06 — implemented

- Schema: `settings` table (`key`, `value`, `is_secret`, `updated_at`, `updated_by`) — migration `0001_settings.sql`
- Module `src/lib/settings.ts`: `get`, `set`, `getCached`, `getMany`, `invalidate`. Plaintext keys cached; secret keys never cached and always read fresh
- Encryption-at-rest: AES-256-GCM via `src/lib/crypto.ts`. Key derived from `INSTALL_PASSPHRASE` env var (falls back to `BETTER_AUTH_SECRET`) with scrypt + static salt. Ciphertext format: `v1:<iv-b64>:<tag-b64>:<ct-b64>`. Random IV per write so two encryptions of the same plaintext differ
- Secret-marked keys: `smtp.password`, `ai.anthropic_key`, `s3.secret_access_key`, `heartbeat.token`. Listed in `SECRET_KEYS` constant — keys not in that set are stored plaintext
- Branding settings: `branding.company_name`, `branding.company_short_name`, `branding.primary_color`, `branding.logo_path`. ISO management rep: `iso.management_representative_user_id`
- Logo upload: server-side handler `src/lib/uploads.ts` writes to `data/uploads/branding/<uuid>.<ext>`. Allowed: PNG, JPG, SVG, WebP. Max 5 MB. Served via `/uploads/[...path]` route handler
- Admin settings page `/admin/settings`: branding form (name, short name, colour, logo) + management rep dropdown (admins only). Auth-gated via `requireAdmin`
- Setup wizard now seeds settings with company info + first admin as management rep on completion
- Login page reads branding (logo, name, colour). `BrandedHeader` component used on dashboard + admin pages — reads cached branding at request time, no rebuild needed
- Cache invalidation: `set()` updates plaintext cache in place, `revalidatePath('/', 'layout')` flushes Next.js cache after admin saves
- Tests: 11 cases in `tests/settings.test.ts` covering get/set/getCached/cache invalidation and crypto round-trip + key isolation. Plus pre-existing 12 tests in `tests/foundation.test.ts`. All against real ephemeral Postgres
- Verified: `npm run build` and `npx tsc --noEmit` both green
- Not verified locally: `npm test` (Docker not running on this machine)
- Deferred: per-user toggles for which admins appear in management-rep dropdown — out of scope; the dropdown shows all admins by design

### 2026-05-08 — verified + closed

Manual HITL test pass on Docker compose build. Three production fixes shipped during verification:

- `src/app/login/actions.ts:120` — decode cookie value before `cookieStore.set`. Better-Auth pre-encodes (`/` → `%2F`); Next's `cookies().set()` re-runs `encodeURIComponent`, double-encoding to `%252F`. HMAC verification failed every request, every refresh redirected to `/login?reason=expired`. Decoding once restores round-trip.
- `next.config.ts` — added `serverExternalPackages: ["pdfkit", "fontkit"]`. Standalone build was bundling pdfkit, rewriting `__dirname` to a `/ROOT` placeholder, ENOENT on `Helvetica.afm`. Affected all 4 PDF routes (audit, meetings, quarterly, qr-poster).
- `src/app/admin/settings/branding-form.tsx` — UX rebuild. Native colour input (`type="color"`) rendered full-width was unusable: now small swatch (h-10 w-14) paired with a hex text input + live preview block. Logo upload moved into a dashed-border drop zone with prominent "+" placeholder, "Click to upload logo" copy, and instant client-side preview of the selected file.

Tests: 211/211 green. Branding/header/login/quarterly-PDF/secret-leak all verified by user.

Follow-up tracked: dashboard has no nav entry to `/admin/*` pages — likely covered under issue #28 (Session UX 30-day polish) or a small standalone task.
