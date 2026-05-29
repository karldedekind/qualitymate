# FAQ

## Why self-hosted?

Construction sites generate sensitive incident data — injury reports, near-misses, contractor performance. We don't think that should leave your network. One install per company. Your hardware, your control, your data.

## What does ISO 9001 actually require?

QualityMate covers the practical clauses: documented information (8.1), control of nonconforming output (8.7), monitoring and measurement (9.1), management review (9.3), corrective action (10.2). Your auditor will look at your *records* and your *process* — QualityMate produces both.

## Do I need an Anthropic API key?

No. AI features (incident triage suggestion, meeting pack drafts, minutes drafts) are optional. Without a key, every form still works — admins just type the triage themselves.

## Can I run without SMTP?

You can boot, log in, and use the app, but distribution emails (.ics invites, meeting minutes, password resets) won't go out. Configure SMTP before inviting users.

## Does it work offline?

The site staff incident form supports offline submission — drafts queue on the device and upload when the phone is back online. The admin tools require connectivity.

## How do I add another admin?

**Admin → Users → Invite**. Set role to `admin`. Send. Once they accept, both of you have admin rights.

## What if I lose access to the only admin account?

Set `RECOVERY_PASSPHRASE` in `.env` (you should have set this at install). Visit `${APP_URL}/setup?recovery=<passphrase>` to re-bootstrap a fresh admin.

## Where are uploaded photos stored?

`./data/uploads/` on the host (mounted into the container). They are also included in nightly backups.

## How big can the install scale?

Designed for small/medium construction firms — say 5 to 200 users, a few thousand incidents per year, dozens of active jobs. Postgres can handle far more; the pinch point is photo storage. Expect ~2 MB per incident with photos.

## Is multi-company supported?

No. One install per company. If you operate two trading entities and need separate audit trails, run two installs.

## How do upgrades work?

Watchtower (bundled in compose) pulls the latest `:1-stable` tag on its schedule (default monthly, 04:00 UTC, 1st of the month). Migrations run on container boot. If a migration fails, the container exits — the previous version stays on the disk image.

## Can I export everything?

Yes. **Admin → Data export** produces a ZIP with every table as CSV, redacted settings, all uploads, and approved meeting PDFs. There is no vendor lock-in.

## Where can I see what changed?

[Changelog](changelog.md).

## How do I report a bug?

`support@qualitymate.com.au` with a diagnostics tarball attached (**Admin → Diagnostics**).
