# Changelog

Format: each release lists user-visible changes. Migrations and internal refactors aren't enumerated unless they affect operators.

## 1.0 — Initial release

First public version. Covers:

- Foundation: container, Postgres, migrations, audit log, settings, branding, setup wizard.
- Auth: better-auth + invite flow + admin password reset + TOTP MFA + admin-MFA-required policy.
- Site check-in: per-job QR posters, on-screen signature, supervisor sign-off, anomaly scan.
- Incidents: manual flow + offline draft queue + AI triage suggestion (BYOK Anthropic).
- Corrective actions: assignment, due-date scans, owner-resolved.
- Meetings: schedule, AI pack draft, minutes draft, attendee sign-offs, director approval, .ics invites, distribution emails.
- Dashboard: KPIs, 12-month trend, category breakdown, top-jobs, actions-by-status, quarterly PDF.
- Data export: full ZIP with CSV per table, redacted settings, uploads, meeting PDFs.
- Backups: nightly tarball, retention 7d/4w/12m, S3 offsite, weekly status email, restore CLI.
- Heartbeat: opt-in hourly ping with documented payload, vendor monitoring dashboard.
- Diagnostics: admin tarball with sanitised env, pg_stat, log tail.
- Voice dictation on incident description (mobile).
- Release pipeline: GHCR multi-arch, `:1` / `:1-stable-rc` / `:1-stable` channels, manual promote, CVE-direct workflow, Watchtower bundled.
- E2E suite: 5 critical paths run on every PR + nightly.

## Upgrade notes

This is the first release. Future versions will document required steps here.
