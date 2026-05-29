# QualityMate — Product Requirements Document

Greenfield rebuild. Self-hosted, single-tenant, no-SaaS-dependency Quality Management System for small construction companies (<30 staff). Pilots at RIM Construction (QLD), then sold to other small construction companies and contractors.

## Problem Statement

Small construction companies (<30 staff) need to file safety/quality incidents, track corrective actions, run quarterly management review meetings, and produce ISO 9001-aligned records. They currently rely on:

- Excel spreadsheets shared on SharePoint or Dropbox — easy to lose, no audit trail, no role separation, hostile on mobile.
- Paper sign-in sheets at site gates — illegible, lost, no real-time roster, fail audit.
- Per-seat SaaS QMS / safety platforms (e.g. SafetyCulture) — recurring subscription cost (~$10K/yr for 30 users), data lives on a vendor's servers, exit cost is high.
- ISO consultant-built bespoke systems — expensive once-off, abandoned when the consultant leaves.

The buyer is a director or owner of a small builder. They want professional-looking quality and safety records, want to own their data, and have low IT support in-house. They hate recurring SaaS bills and value cap-ex purchases. They need a system that works on a foreman's phone in the field with poor signal, but also passes an external ISO 9001 audit walkthrough.

Existing market does not serve this buyer well — every option is either toy-grade (Excel) or enterprise-priced SaaS.

## Solution

A single-tenant, self-hosted QMS web application delivered as a Docker Compose bundle, sold one-time per company with optional annual support. White-label light branding (company name, logo, primary colour) configured at install time and runtime-editable.

Core workflow already proven in the prior prototype:

1. **Incident submission** — site or office staff file an incident from any device. AI (optional, customer's own Anthropic API key) auto-suggests root cause, priority, and category.
2. **Improvement register** — admin reviews AI suggestions, confirms or overrides, decides whether to close or escalate to a corrective action.
3. **Corrective actions** — actions tracked with assignee, deadline, status. Notifications to assignees on assignment, due-soon, overdue.
4. **Quarterly management review meetings** — AI-generated pre-meeting pack, AI-drafted minutes, attendee sign-offs, director approval, email to stakeholders. Meets ISO 9001 clause 9.3 evidence needs.
5. **Site check-in (new feature)** — public, auth-free QR-poster-driven sign-in for subcontractors and visitors. Captures identity, white card, emergency contact, drawn signature, eight QLD-aligned safety declarations, and planned departure time. No sign-out flow (departure declared at sign-in, since people forget to sign out).

All data stored in a Postgres database in a Docker volume on the customer's own server (cheap VPS or office NAS). Photos stored as files in the same volume, resized on upload. Nightly backup tarball. Weekly DB dump emailed to admin via SMTP. Optional offsite push to S3-compatible bucket.

Authentication via email + password (no SaaS auth provider). Admin invites users by email. Two roles: `site_staff` and `admin`. MFA via TOTP optional and per-admin. Sessions 30 days. Rate limiting per IP and per email.

AI features degrade gracefully: when no Anthropic API key is configured, AI buttons are hidden, all forms still work in manual mode.

Customer's perspective:

- One-time purchase, perpetual licence, optional annual support (covers updates and bug fixes).
- Their data, their server, their backups. Full ZIP export at any time produces human-readable CSVs plus photos plus PDFs.
- Updates delivered via Watchtower auto-pull from a public Docker registry; staged via a release-candidate tag with the RIM Construction install acting as canary.
- Phone support by email within two business days. Diagnostics tarball button generates a redacted log+stats bundle the customer emails to support.
- Optional opt-in anonymous heartbeat lets vendor proactively spot outages.

## User Stories

### Site staff

1. As a site foreman, I want to file an incident from my phone in the mud with gloves on, so that I can capture the issue while it's fresh and not have to remember it back at the office.
2. As a site foreman, I want to attach photos taken on my phone camera directly to the incident, so that I have visual evidence and don't have to email files separately.
3. As a site foreman, I want my incident form to save a draft if I lose signal, and submit automatically when signal returns, so that I never lose what I typed.
4. As a site foreman, I want to dictate the description by voice, so that I don't have to type with gloves on.
5. As a site foreman, I want to see the incidents I have filed, so that I can follow up on what happened.
6. As a site staff member, I want to see corrective actions assigned to me, so that I know what I'm responsible for resolving.
7. As a site staff member, I want to mark my own actions as resolved, so that the office knows the issue is closed.
8. As a site staff member, I want notifications when an action assigned to me is due in three days or overdue, so that I don't drop the ball.
9. As a site staff member, I want to log in once on my phone and stay logged in, so that I don't have to re-enter my password every time I open the app.
10. As a site staff member, I want a one-page printable guide showing me how to file an incident, so that I can read it once and remember.

### Admin

11. As an admin, I want to review pending incidents with AI-suggested root cause and priority, so that I can triage faster than reading every word.
12. As an admin, I want to override the AI's suggestions when it's wrong, so that the final record reflects reality and not a hallucination.
13. As an admin, I want to close an incident or escalate it to a corrective action, so that the workflow has a clear next step.
14. As an admin, I want to assign actions to a specific person with a deadline, so that ownership is unambiguous.
15. As an admin, I want to schedule quarterly management review meetings, so that I meet ISO 9001 clause 9.3 obligations.
16. As an admin, I want an AI-generated pre-meeting pack summarising incidents, actions, and trends for the quarter, so that I walk into the meeting prepared.
17. As an admin, I want an AI-drafted set of minutes after the meeting, so that I'm not re-typing handwritten notes.
18. As an admin, I want each attendee to sign off on the minutes, and the director to approve, so that there is an audit trail of agreement.
19. As an admin, I want approved minutes emailed automatically to all attendees plus a director-defined distribution list, so that nobody has to be chased.
20. As an admin, I want to invite new users by email or generate a copy-paste invite link, so that I can onboard staff even when SMTP is down.
21. As an admin, I want to assign one of two roles (admin or site staff) to each user, so that role boundaries are simple and obvious.
22. As an admin, I want to deactivate a user without deleting their history, so that an ex-employee's audit trail survives.
23. As an admin, I want to configure the SMTP server from the settings page and run a test send, so that I know email works before I rely on it.
24. As an admin, I want to paste an Anthropic API key in the settings page and have its validity tested, so that AI features turn on cleanly.
25. As an admin, I want to upload a company logo, set a primary colour, and edit the company name and short name, so that the system feels like ours.
26. As an admin, I want a dashboard showing open incidents, actions overdue, average days to close, and meeting status, so that I have a director-ready view at a glance.
27. As an admin, I want charts of incidents by category, monthly trends, top jobs by incident count, and actions by status, so that I can answer the director's questions without spreadsheet work.
28. As an admin, I want a downloadable quarterly report PDF, so that I can hand it to the director or board without manual formatting.
29. As an admin, I want a full ZIP export of all data — CSVs, photos, audit log, meeting PDFs, settings — at any time, so that I am never locked in.
30. As an admin, I want to view a full audit history per incident, action, meeting, and user, so that I can defend any record to an ISO auditor.
31. As an admin, I want to export the audit log filtered by date range and entity type to CSV and PDF, so that I can produce auditor-ready packs.
32. As an admin, I want to manually trigger a backup tarball download, so that I have a known-good snapshot before doing something risky.
33. As an admin, I want to see a list of recent backup tarballs and download any, so that I can recover from a recent state if needed.
34. As an admin, I want to receive a weekly database backup by email, so that I have an offsite copy without configuring object storage.
35. As an admin, I want to optionally configure S3-compatible offsite backup, so that photos and full state are preserved through a server failure.
36. As an admin, I want to enable TOTP-based MFA for admin accounts and require it for all admins, so that admin compromise risk is reduced.
37. As an admin, I want to reset another user's password directly from the user management page, so that I can unblock a locked-out staff member without SMTP.
38. As an admin, I want to edit the safety declaration text on the site check-in form, so that I can match our internal policies and state requirements.
39. As an admin, I want to add a new job and immediately get a printable A4 QR poster for that job's site check-in, so that I can stick it on the gate the same day.
40. As an admin, I want to view a daily roster of who signed in to a job site, with their company, trade, planned departure, and white card status, so that I have a defensible attendance record.
41. As an admin, I want to filter the daily roster by trade or company and export it to CSV, so that I can answer questions like "who from BuildSafe was on site Wednesday?"
42. As an admin, I want a notification when more than five unknown subcontractors sign in to a single job in one day, so that I can investigate anomalies.
43. As an admin, I want to see a "currently expected on site" count per job, derived from sign-ins where now is between signed-in time and planned departure, so that I have a live (if approximate) picture.
44. As an admin, I want a print-friendly daily roster, so that the supervisor can carry a paper copy on a clipboard.
45. As an admin, I want a per-job public read-only roster URL with a token, so that a supervisor without an account can pull up today's roster on their phone.

### Director

46. As a director, I want to digitally sign and approve quarterly meeting minutes, so that the record is legally defensible.
47. As a director, I want emailed approved minutes auto-sent to attendees and stakeholders after I approve, so that distribution is automatic.
48. As a director, I want the dashboard quarterly PDF to be auditor-ready, so that I can present it without rework.

### Subcontractor / visitor (no account)

49. As a subcontractor arriving on site, I want to scan a QR code on the gate poster and reach a sign-in form without needing an account or app, so that I can sign in in under two minutes.
50. As a subcontractor, I want to pick the job site from a single global list, so that I never have to type a job code from a poster.
51. As a subcontractor, I want to enter my full name, mobile, company, trade, emergency contact, white card number and expiry, and tick eight safety declarations, so that I can be on site legally and safely.
52. As a subcontractor, I want to draw my signature on the screen with my finger, so that the record carries legal weight under the Electronic Transactions Act.
53. As a subcontractor, I want to enter my planned departure time at sign-in, so that I don't have to remember to come back and sign out.
54. As a subcontractor, I want a clear privacy notice and a consent checkbox before I submit, so that I know how my data is used and retained.
55. As a subcontractor, I want a clear "Thanks, signed in" confirmation page after submission, so that I know it worked.
56. As a subcontractor, I want the form to refuse my submission if my white card is expired, so that I'm not unknowingly working illegally.

### Customer (buyer / owner)

57. As a small construction company owner, I want to buy the software once for a fixed cap-ex amount rather than recurring SaaS, so that my expenses are predictable and I own what I bought.
58. As a customer, I want optional white-glove installation by the vendor, so that I don't have to learn Docker or SSH.
59. As a customer, I want a browser-based setup wizard after install, so that I never have to edit configuration files.
60. As a customer, I want my data on a server I control, so that I am not exposed if a SaaS vendor goes under or breaches.
61. As a customer, I want to skip optional setup steps (SMTP, AI) and add them later, so that I'm not blocked at install if I don't have those credentials yet.
62. As a customer, I want clear documentation in plain English with screenshots, so that I can self-serve before calling support.
63. As a customer, I want updates delivered automatically by default with the option to disable, so that security patches arrive without me thinking about it.
64. As a customer, I want a recovery passphrase mechanism so that if I lose all admin accounts I can re-bootstrap, so that I'm not soft-bricked.
65. As a customer, I want my company name and logo on the login page, emails, and PDFs, so that the system feels like ours, not a generic vendor product.
66. As a customer, I want to be able to opt out of vendor telemetry, so that I retain full data sovereignty.
67. As a customer, I want a diagnostics tarball button that produces a support bundle without my incident content, so that I can get help fast without leaking sensitive data.
68. As a customer, I want a documented disaster recovery procedure, so that I know exactly what to do if my server dies.
69. As a customer cancelling support, I want my existing install to keep working, so that I am not coerced into renewing.

### Auditor (external ISO 9001 / WHS)

70. As an auditor, I want to see the full history of any incident, action, or meeting with timestamps and user identity, so that I can verify control conformance.
71. As an auditor, I want a named "management representative" recorded in settings, so that clause 5.3 responsibility is documented.
72. As an auditor, I want exported audit log evidence in a format I can read in Excel or as PDF, so that I can include it in my audit pack.
73. As an auditor, I want signed quarterly meeting minutes with attendee sign-offs and director approval, so that clause 9.3 evidence is unambiguous.
74. As an auditor, I want site attendance records that include white card status at time of entry, so that clause-equivalent WHS obligations are demonstrably met.

### Vendor (you)

75. As the vendor, I want a single Docker image release pipeline with versioned tags and a release-candidate canary, so that I do not break paying customers.
76. As the vendor, I want a small private monitoring dashboard fed by opt-in heartbeats, so that I can proactively contact customers whose installs go offline.
77. As the vendor, I want each support request to come with a redacted diagnostics bundle, so that I can reproduce issues without back-and-forth.
78. As the vendor, I want to be able to ship a per-customer migration script as a one-off paid service, without building a self-serve import feature, so that I'm not doing speculative work.
79. As the vendor, I want a marketing landing page and a public docs site, so that I can convert demo traffic and reduce repeat support questions.
80. As the vendor, I want a signed EULA template and bound professional indemnity insurance before customer #2, so that my downside is bounded.

## Implementation Decisions

### Architecture

- Self-hosted, single-tenant per install. No multi-tenancy code, no row-level tenant isolation.
- Docker Compose deploys app + Postgres + Caddy reverse proxy (Let's Encrypt automatic). Single artifact.
- All state in Postgres + a `data/` Docker volume holding `uploads/`, `backups/`, and (optional) `license.lic` placeholder.
- Branding driven by runtime-editable settings — never compile-time constants.
- "Powered by QualityMate" footer remains; single SKU; no tiered editions.

### Stack

- Next.js 16 App Router, React 19, TypeScript 5.
- Tailwind CSS 4 with shadcn/ui-style components.
- Drizzle ORM against vanilla Postgres (no Supabase).
- Better-auth for sessions, password hashing, password reset, TOTP MFA, with a Drizzle adapter.
- nodemailer for SMTP.
- Anthropic SDK for AI (BYOK).
- sharp for image resize.
- recharts for dashboard charts.
- signature_pad for canvas-drawn signatures.
- next-pwa or hand-rolled service worker for offline incident draft + photo queue (IndexedDB).
- Caddy for HTTPS with Let's Encrypt.
- Watchtower for auto-update of the app container.
- MkDocs Material for the public docs site, hosted on Cloudflare Pages.

### Modules (deep, testable)

- **AuditLog** — `record(actor, action, entity, before, after)`, `history(entity)`, `export(filters)`. Hides snapshot diff, IP and user-agent capture, denormalised user email, retention.
- **Settings** — `get(key)`, `set(key, value)`, `getCached()`. Hides encryption-at-rest for secrets (SMTP password, Anthropic API key) and cache invalidation.
- **Notify** — `send(userId, event, payload)`. Fan-out to in-app row + email; falls back to in-app only if SMTP unconfigured. Generates `.ics` for meeting events.
- **AI** — `suggestStructure(incident)`, `draftMinutes(meeting)`, `generatePack(meeting)`, `isConfigured()`. Returns `null` when no key. UI hides AI affordances based on `isConfigured()`.
- **Storage** — `upload(file, scope)`, `url(path)`, `delete(path)`. Hides resize, path scheme `{entity}/{id}/{uuid}.{ext}`, volume mount.
- **Backup** — `createTarball()`, `restoreTarball(path)`, `emailWeekly()`, `pushToS3()`. Hides pg_dump, tar streaming, S3-compat client, retention pruning (7 daily / 4 weekly / 12 monthly).
- **DataExport** — `fullZip(opts)`. Streams a ZIP containing CSVs of every entity, photos, settings JSON, README, and audit log.
- **SiteCheckIn** — `submit(data)`, `roster(jobId, date)`, `posterPdf(jobId)`, `supervisorRosterToken(jobId)`. Hides white card expiry validation, signature persistence, declaration enforcement, rate limiting.
- **Incidents** — `file(input)`, `attachPhotos(id, files)`, `review(id, decisions)`, `close(id, reason)`. Owns register-entry coupling and status transitions.
- **Actions** — `create(input)`, `assign(id, userId)`, `resolve(id)`, `dueSoonScan()`, `overdueScan()`. Cron-driven scans trigger Notify.
- **Meetings** — `schedule(input)`, `generatePack(id)`, `draftMinutes(id)`, `signOff(id, attendee)`, `approve(id)`, `emailApproved(id)`. Owns AI calls, signoff JSONB structure, PDF route, .ics generation.
- **Metrics** — `kpis(role, user)`, `incidentTrend(months)`, `categoryBreakdown()`, `actionsByStatus()`, `topJobsByIncidentCount(n)`. Drizzle SQL aggregations, role-aware.
- **Auth** — `inviteUser(email, role)`, `login(email, pw)`, `requireRole(req, role)`, `setupMfa(userId)`, `requestPasswordReset(email)`, `adminResetPassword(targetUserId)`. Wraps Better-auth with project rules.
- **SetupWizard** — `currentStep()`, `submitStep(data)`, `complete()`, `recover(passphrase)`. State machine over a `setup_state` row.
- **OfflineQueue** (client) — `queueIncident(draft)`, `flush()`. IndexedDB-backed queue, service-worker-triggered sync.

### Schema (key tables)

- `users`, `sessions`, `accounts`, `verification_tokens` — Better-auth standard plus a `role` enum (`admin`, `site_staff`) and `deactivated_at`.
- `audit_log` — append-only: `id`, `ts`, `user_id`, `user_email_snapshot`, `entity_type`, `entity_id`, `action`, `before` jsonb, `after` jsonb, `ip`, `user_agent`. Login successes and failures recorded too.
- `settings` — key/value, secrets stored encrypted at rest using a key derived from an installation-time passphrase env var.
- `jobs`, `categories` (Q×20 + E×12 seeded), `incidents`, `register_entries`, `actions`, `meetings`.
- `notifications` — `id`, `user_id`, `type`, `entity_type`, `entity_id`, `body`, `read_at`, `created_at`.
- `site_attendances` — `id`, `job_id`, `full_name`, `mobile`, `company_name`, `trade`, `emergency_contact_name`, `emergency_contact_phone`, `white_card_number`, `white_card_expiry`, eight declaration booleans, `signature_path`, `signed_in_at`, `planned_departure_at`, `ip`, `created_at`.
- `setup_state` — single-row state machine for the browser setup wizard.

### Authentication

- Email + password only at login. No magic link, no PIN, no SSO in v1.
- Password rules: minimum 8 characters, no other complexity rules (NIST SP 800-63B aligned).
- TOTP MFA optional per admin; admin-level setting can require MFA for all admins.
- 30-day default session for both roles. "Remember me" implicit (no toggle).
- Rate limit: 5 failed attempts per IP and per email within 15 minutes triggers a 15-minute cooldown.
- Password reset by email link (Better-auth standard) and by admin reset (admin sets a temporary password the user must change on first login).
- Setup wizard creates the first admin. Recovery passphrase env var allows bootstrapping a new admin if the user table loses all admins.

### Roles and permissions

Two roles only: `site_staff` and `admin`. Permission map static in code, gated via `requireRole` and a small `can(user, capability)` helper. ISO "management representative" is a named admin recorded in settings, not a separate role.

### Site check-in

- Single global URL: `/checkin`. Job dropdown, no per-job token URL.
- Read-only supervisor roster URL is per-job and token-protected.
- Mandatory fields: full name, mobile, company name, trade (dropdown of QLD trades + Other), emergency contact name and phone, white card number, white card expiry, job, planned departure, drawn signature.
- Eight required declarations (all checkboxes):
  1. I have read the WHSMP.
  2. I am aware of the emergency details.
  3. I am fit for work today.
  4. I know what to do in an emergency and where the emergency equipment is.
  5. I am aware of the site hazards and will notify the supervisor if any new hazards are identified.
  6. I have the right PPE I need for my work.
  7. I am trained and competent for the work I will be doing.
  8. I will follow site rules and I will complete a SWMS for any high-risk construction work.
- White card expiry must not be in the past — submission rejected with clear error if expired.
- No sign-out flow. Planned departure recorded at sign-in.
- Per-IP rate limit; submission audited.
- Privacy notice + explicit consent checkbox before submission. Retention aligned to WHS record-keeping (7 years).
- A4 QR poster generator per job — printable PDF with company logo, job name, big QR code, and human-readable URL fallback.

### AI

- BYOK: Anthropic API key pasted in admin settings, encrypted at rest, validated on save with a small probe call.
- Manual fallback: when key is absent or invalid, AI suggestion buttons do not render. All forms still work, fields fillable by hand.
- AI features: incident structure suggestion (root cause, priority, category), pre-meeting pack generation, draft minutes generation.
- AI suggestions surfaced as suggestions, never auto-applied. Admin must confirm or override. Each AI call recorded in audit log.

### File storage and photos

- Local Docker volume `data/uploads/{entity}/{id}/{uuid}.{ext}`.
- sharp resize on upload to max 1920px wide, EXIF date preserved.
- Multi-file mobile upload with `<input capture="environment">` for camera capture.

### Email

- Customer-supplied SMTP via nodemailer, configured in settings.
- Test-send button.
- Fallback: when SMTP not configured, invite flow shows a copyable link to admin and notifications are in-app only.
- Calendar invites for meetings: `.ics` attached.

### Notifications

- Both channels (in-app + email) for every notifiable event in v1, no per-user toggles.
- Bell icon in header, unread count, dropdown of last 20.
- Events: incident filed, incident assigned (action), action due in 3 days, action overdue, meeting scheduled, pre-meeting pack ready, minutes drafted, minutes approved, user invited, password reset requested, anomaly on site (>5 unknown subcontractor sign-ins).

### Dashboard and reports

- Role-aware dashboard at `/dashboard`.
- site_staff view: my incidents (last 5), my actions (open + overdue highlighted).
- admin view: 4 KPI cards (open incidents, actions overdue, average days to close, next quarterly meeting status); 4 charts (category donut, 12-month trend line, top 5 jobs bar, actions by status stacked bar).
- Quarterly Report PDF generated via the `(print)` route group, suitable for board and auditor.

### Audit log

- Single append-only table with snapshots of every create / update / delete on every domain entity, plus settings changes, login events, and AI calls.
- Per-entity History tab.
- Filterable export to CSV and PDF.
- Retention: indefinite. Volumes are small enough for a small construction company (~1 GB per year).

### Data export

- Full ZIP at `/admin/data-export`: CSVs per entity, `audit_log.csv`, `settings.json`, photos under `uploads/`, meeting PDFs, and a plain-English `README.txt` describing the schema.
- Streams to client; no temporary files on disk.
- Audited; rate-limited to one export per admin per 5 minutes.

### Backup and disaster recovery

- Nightly local tarball: `pg_dump | gzip` plus `tar` of `uploads/`, written to `data/backups/`.
- Weekly DB-only backup emailed to admin via SMTP (capped at 25 MB, prompts to enable offsite if exceeded).
- Optional offsite push to S3-compatible bucket (B2, Wasabi, MinIO, AWS) — admin pastes endpoint, bucket, and credentials in settings.
- Retention: 7 daily, 4 weekly, 12 monthly.
- Restore CLI: `docker compose run --rm app npm run restore` consumes a tarball from `data/restore/`.
- DR runbook documented in repo and on docs site.

### First-run onboarding

- Browser setup wizard at `/setup`. Detects empty DB on first visit. Locks itself when complete.
- Steps: welcome → company info → admin account → SMTP (skippable) → AI key (skippable) → done.
- Recovery passphrase from env var allows re-running setup or re-bootstrapping admin if user table is empty.

### Updates and release pipeline

- GitHub Actions builds and tags Docker images on push to `main`. Three tags: `:1` (rolling latest 1.x), `:1-stable-rc` (RIM canary), `:1-stable` (paying customers).
- Watchtower bundled with default monthly schedule, customer can disable via `.env`.
- Drizzle migrations run on container boot before HTTP server accepts requests; failure blocks startup so partial-migration breakage is impossible.
- Security CVE patches skip the canary week and release directly to `:1-stable` with notes.

### Monitoring and support

- Opt-in anonymous heartbeat hourly to vendor endpoint: `instance_id` (random UUID), version, uptime, user count, 30-day incident count, 24h error count. No PII, no incident text, no company name unless customer separately opts in.
- Vendor monitoring dashboard alerts vendor when an opted-in instance has not pinged in 1 hour.
- Diagnostics tarball button in admin settings: gathers last 5000 log lines, Postgres `pg_stat_*`, container version, sanitised env. Customer downloads and emails to support.
- Email support, 2-business-day SLA included in annual support fee.

### Licensing

- Honor system. License agreement text only. No tech enforcement, no signed license file, no phone-home check.
- Public Docker registry (anyone can pull); customer relationship is contractual.

### Pricing

- $3,500 one-time licence (single SKU).
- $600 per year optional support.
- $750 white-glove install.
- Discount of 50% off licence for customers #2-#5 in exchange for a written case-study commitment.

### White-label branding

- Light only: company name, short name, logo, primary colour. Settings page upload + colour picker.
- All UI, login page, emails, PDFs read these values from cached settings at request time.

### Documentation

- MkDocs Material docs site at `docs.qualitymate.com.au`, hosted on Cloudflare Pages.
- Sections: Setup, Admin Guide, Site Staff Guide, Site Check-in, Backup and Restore, Troubleshooting, FAQ, Changelog.
- One-page printable PDF "How to file an incident on your phone."
- Per-job QR poster generator (in app).
- Marketing site at `qualitymate.com.au`: landing page, pricing, demo Loom video, contact form, downloadable PDF brochure.
- Internal vendor docs (per-customer install notes, support history) in a private git repo.

### Legal

- Custom EULA drafted by an Australian small-business lawyer. Includes per-install scope, no-redistribution, no-warranty disclaimer, liability cap = fees paid in prior 12 months, governing law (QLD initially), and an explicit AI clause: "Customer warrants that AI suggestions are reviewed by a qualified person before action."
- Professional indemnity insurance ($2-5M) bound before customer #2.
- Trademark + ASIC + domain searches conducted before launch. Rebrand if conflict found.

## Testing Decisions

### Definition of a good test

- Tests verify external observable behaviour, not internal implementation. A test that breaks because the SQL query was rewritten but produced the same answer is a bad test.
- Domain modules tested at the seam where the rest of the app calls them — the public function signatures listed above.
- Only mock at the network boundary (Anthropic SDK, SMTP, S3 client). Database tests run against a real ephemeral Postgres in CI; mocks of the database are not used.
- E2E tests cover golden paths through the UI; unit tests cover branching logic that E2E would be slow or non-deterministic to exercise.
- Each test states the user-visible behaviour it's asserting in its name.

### Modules with unit / integration tests

- **AuditLog** — given a sequence of writes through the central wrapper, the audit log produces the expected before/after diffs and the history-by-entity view returns events in reverse chronological order. Snapshot of `user_email_snapshot` survives user soft-delete.
- **AI** — given a stub Anthropic transport, `suggestStructure` returns a normalised shape, handles malformed JSON, returns `null` from `isConfigured()` when no key is set, and never throws to the caller.
- **Backup** — `createTarball` followed by `restoreTarball` against a fresh Postgres reproduces the original DB state and `uploads/` contents byte-for-byte. Retention pruning preserves the expected 7/4/12 set after 60 simulated daily backups.
- **DataExport** — full ZIP contains the expected file tree given a seeded fixture; CSVs round-trip back into Postgres without loss; photo paths in the ZIP match the photo manifest in CSV.
- **SiteCheckIn** — submission with all eight declarations true and a non-expired white card succeeds; submission with any declaration false is rejected; submission with expired white card is rejected with a specific error code; submission with missing signature is rejected; per-IP rate limit blocks the 21st submission within an hour (limit 20/hour, raised from original 10 during issue 07 HITL on 2026-05-13).
- **Incidents** — status transitions (`pending_review` → `open` → `closed`) succeed via legal paths and reject illegal ones; AI suggestions can be applied or overridden; closing creates a register entry with the correct linkage.
- **Actions** — `dueSoonScan` returns only actions whose deadline is within 3 days and not yet resolved; `overdueScan` returns only actions past deadline and not yet resolved; both call Notify with the right payload.
- **Metrics** — given a seeded fixture of incidents and actions, `kpis` returns the expected counts; `incidentTrend(12)` returns 12 buckets; `categoryBreakdown` sums to total.
- **Auth** — `inviteUser` creates an inactive user and a single-use invite token; `adminResetPassword` invalidates existing sessions; rate limit triggers cooldown after 5 failed attempts within 15 minutes.

### E2E (Playwright)

5 critical paths run on every PR and nightly on `main`:

1. Site staff login → file incident with photo → submitted and visible in own list.
2. Admin login → review pending incident → apply AI suggestion (mocked) → confirm → close.
3. Admin → create action → assign user → that user logs in → marks resolved.
4. Admin → schedule meeting → generate pre-pack → draft minutes → attendee signs off → director approves → email send observed.
5. Setup wizard from empty DB to first admin login.

### Migration tests

A dedicated CI job spins up a fresh Postgres, runs every Drizzle migration in order from v1, seeds a small fixture, and asserts the schema matches the expected snapshot. Catches the most common silent killer of self-hosted apps.

### Manual smoke checklist

A 10-item Markdown checklist in the repo, executed by a human before tagging any release. Login, file incident, run AI, generate meeting pack, export ZIP, restore from backup, etc.

### Skipped

- Frontend component-level unit tests — covered by E2E.
- Snapshot tests of rendered HTML — brittle.
- Full unit test coverage of thin wrappers (Settings, Storage, Auth library glue).

## Out of Scope

- Multi-tenant deployment.
- Hard licence enforcement (no signed licence file, no phone-home, no max-user gate).
- ISO 9001 modules beyond incidents, register, actions, meetings, audit log: document control (clause 7.5), training records (7.2), supplier evaluation (8.4), risk register (6.1), internal audits (9.2), calibration register (7.1.5).
- Custom roles or per-permission grants.
- Self-serve CSV data import for new customers (offered as paid service instead).
- AI chatbot in docs.
- Live remote SSH support.
- Native iOS/Android apps.
- SMS notifications.
- Custom domain branding beyond settings.
- Advanced report builder.
- Bundled or proxied AI credits.
- Bundled SMTP relay.
- Cold outreach and content marketing in launch GTM.
- States other than QLD in v1 (declarations and white card are QLD-aligned). NSW/VIC variants come post-launch on customer demand.

## Further Notes

### Build sequence

**M1 — RIM Construction pilot (12 weeks):**

| Week | Focus |
|---|---|
| 1 | Foundation: Next.js + Drizzle + Postgres + Docker compose; users, sessions, audit_log, settings tables; Better-auth wired; 2 roles; basic layout. |
| 2 | Auth UX + setup wizard; password reset (email + admin); rate limit; 30-day session. |
| 3 | Audit log central wrapper + history views; settings page (branding, SMTP, AI key, encryption at rest); test buttons. |
| 4 | Jobs + categories + users management; notifications table + bell icon. |
| 5-6 | Site check-in feature (full spec). Per-job QR poster generator. Daily roster. Supervisor read-only roster URL. |
| 7 | Incidents (file + view) with photo upload + sharp resize + mobile camera capture. |
| 8 | PWA + offline draft (IndexedDB queue + service worker sync). |
| 9 | AI integration + register entries + manual fallback. |
| 10 | Corrective actions + cron-driven due-soon / overdue notifications. |
| 11 | Meetings + AI pre-pack + AI draft minutes + sign-offs + approval + email + print PDF. |
| 12 | Dashboard + 4 KPIs + 4 charts + quarterly PDF + full ZIP export + nightly backup + weekly email + restore CLI + DR runbook. |

**M2 — Customer #1 ready (4 weeks, parallel tracks):**

| Week | Track A (engineering) | Track B (legal / business) |
|---|---|---|
| 13 | Watchtower + image release pipeline (GH Actions → GHCR) + canary tags + migration tests + boot-time migrations. | Trademark + domain + ASIC searches; engage AU lawyer; PI insurance quotes. |
| 14 | Heartbeat opt-in endpoint + vendor monitoring dashboard + diagnostics tarball button. | EULA review; PI insurance bind; pricing page copy. |
| 15 | TOTP MFA for admins + optional S3-compat offsite backup + 5 Playwright E2E tests + CI gate + bug-bash from RIM pilot. | Marketing landing page + 3-min Loom demo + 1-page brochure. |
| 16 | MkDocs docs site published + site staff PDF + white-glove install runbook. | First-customer pitch list + quote template + sign customer #1. |

### GTM

A → B → C in order:

- **A. RIM Construction network (customers 1-3):** suppliers, subcontractors, peers. 50% off licence and full white-glove install in exchange for a written case study.
- **B. ISO consultants as channel partners (customers 4-10):** 2-3 consultants in NSW/VIC, $500 per closed referral, branded demo install.
- **C. Industry associations (customers 10+):** Master Builders Association, HIA — preferred-supplier listing, newsletter, training events.

Skip cold outreach and content marketing for v1.

### QLD-specific

- Site check-in declarations align with QLD WHS Regulation 2011 (high-risk construction work, SWMS) and the QLD General Construction Induction card (the so-called "white card").
- Lawyer engagement and PI insurance are AU-domiciled; governing law starts at QLD.
- Tax: ABN + GST handled via RIM Construction's existing setup; invoicing in AUD with 30-day terms.

### Telemetry boundary

Anonymous heartbeat is the only outbound vendor connection from a customer install, and it is opt-in. All other dependencies are customer-controlled (their SMTP, their Anthropic key, their object store, their domain). The product can run with all external connections disabled — only Watchtower (also customer-disablable) needs registry access for updates.

### Risks and mitigations

- **Bad release breaks paying customers via Watchtower auto-update.** Mitigation: RIM canary on `:1-stable-rc` for one week before promotion; staged tags; CI gate on Playwright E2E.
- **AI suggestions cause customer to act on incorrect root cause and a real-world incident follows.** Mitigation: AI suggestions are never auto-applied; explicit AI clause in EULA; PI insurance.
- **VPS dies, customer's data lost.** Mitigation: weekly DB email default, optional S3-compat offsite, documented DR runbook, white-glove install configures both.
- **Customer pirates and resells.** Mitigation: accepted residual risk under honor-system licensing; deterrent is social and contractual, not technical.
- **AI key leakage from settings page.** Mitigation: encryption at rest with installation passphrase, never logged, never returned in API responses (write-only field).
- **Subcontractor signs in to wrong job from global dropdown.** Mitigation: dropdown shows job number + name; admin reviews daily roster; downside is data quality, not safety.
