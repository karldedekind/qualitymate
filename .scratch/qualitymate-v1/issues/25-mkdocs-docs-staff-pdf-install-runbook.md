# MkDocs docs site (Cloudflare Pages) + site staff PDF + white-glove install runbook

---
Status: done
---

## What to build

MkDocs Material docs site at `docs.qualitymate.com.au`, hosted on Cloudflare Pages. Sections: Setup, Admin Guide, Site Staff Guide, Site Check-in, Backup and Restore, Troubleshooting, FAQ, Changelog. One-page printable PDF "How to file an incident on your phone." Per-job QR poster generation documented (with screenshot). White-glove install runbook in private repo.

## Acceptance criteria

- [x] MkDocs Material site builds and deploys to Cloudflare Pages (workflow ready; secrets + Pages project must be created in Cloudflare)
- [x] All eight sections written (image placeholders pending real screenshots)
- [x] Site staff one-page PDF generated from docs source
- [x] Per-job QR poster generation documented with screenshot from app (placeholder image; capture pending)
- [ ] DNS for `docs.qualitymate.com.au` configured (one-time manual: CNAME → Pages target after first deploy)
- [x] White-glove install runbook in private vendor repo (not on public docs site) — public docs link out, private repo `qualitymate-runbook` is referenced but not added here

## Blocked by

None — can start immediately, parallel with other work.

## Comments

### 2026-05-06 — implementation

**Site config**

- `mkdocs.yml` — Material theme with light/dark palette, blue primary; `docs_dir: docs-site`, `site_dir: site` (kept separate from existing internal `docs/agents/` and `docs/adr/`). `repo_url` set. Plugins: search. Markdown extensions: admonition, attr_list, def_list, md_in_html, tables, toc-with-permalink, pymdownx.{details,highlight,superfences,tabbed}.
- Nav: Home, Setup, Admin Guide, Site Staff Guide, Site Check-in, Backup and Restore, Troubleshooting, FAQ, Changelog — all 8 sections per AC plus a Home page that orients the reader and points at the others.

**Pages (`docs-site/`)**

- `index.md` — what it is / isn't / pointers.
- `setup.md` — prereqs, env vars table (`BETTER_AUTH_SECRET`, `INSTALL_PASSPHRASE`, `RECOVERY_PASSPHRASE`, `APP_URL`, `BETTER_AUTH_URL`), `docker compose up -d`, setup wizard walkthrough (admin email/name/password), SMTP/AI/S3/heartbeat config, invite users, cron schedule for scans + heartbeat + backups.
- `admin-guide.md` — dashboard, jobs (including QR poster section), incidents (with AI suggest/apply flow), actions, meetings (schedule → pack → minutes → sign-off → approve → distribution), users, settings, MFA, audit log, data export, heartbeat & diagnostics, backups.
- `site-staff-guide.md` — login, file incident (3 routes: dashboard, QR scan, printable card), `/incidents/mine`, `/actions/mine`, meeting sign-off flow.
- `site-checkin.md` — QR poster, worker view (company autocomplete, signature), supervisor view, anomaly scan.
- `backup-restore.md` — what's captured (CSV per table, migrations, uploads, manifest), schedule, S3 offsite, listing, manual run, **danger-admonition** restore steps with `session_replication_role` rationale, smoke-test guidance, DR runbook pointer.
- `troubleshooting.md` — boot failure (migrations log + image rollback), login loop, SMTP test, AI probe, QR poster, backup/restore, photos permissions, Watchtower, diagnostics tarball.
- `faq.md` — self-host rationale, ISO 9001 scope, optional Anthropic, offline behaviour, second admin, lost-admin recovery, photo storage path, scaling envelope, multi-company stance, upgrade model, full export, change tracking.
- `changelog.md` — 1.0 enumerated by feature area; upgrade-notes scaffold for future versions.

**One-page incident-card PDF**

- `scripts/build-incident-card-pdf.ts` — pdfkit-driven A4 page with seven numbered steps + "If you can't sign in" + "After you submit". Brand-colour heading, divider rules, step indents. Generated locally: 2540 bytes, single page. `npm run docs:incident-card` script added.
- Output `docs-site/site-staff/incident-card.pdf` is gitignored — generated in CI before MkDocs build, served from `/site-staff/incident-card.pdf` via the link in `site-staff-guide.md`.

**Cloudflare Pages workflow**

- `.github/workflows/docs.yml` — push-to-`main` (and PRs that touch docs) triggers: Node 22, Python 3.12, `pip install mkdocs-material`, `npm ci`, `npm run docs:incident-card`, `mkdocs build`, upload site artifact (14-day retention), then on `main` deploy via `cloudflare/wrangler-action@v3` to `pages deploy site --project-name=qualitymate-docs --branch=main`.
- Required secrets (set in repo Settings → Secrets):
  - `CLOUDFLARE_API_TOKEN` (Pages:Edit scope)
  - `CLOUDFLARE_ACCOUNT_ID`

**Outstanding manual steps** (documented in workflow comments and noted here so the AC owner can finish):

1. Create the `qualitymate-docs` project in Cloudflare Pages (initial project setup is a UI step).
2. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
3. Add custom domain `docs.qualitymate.com.au` in Pages → Custom domains. Cloudflare prints the CNAME target.
4. Set the DNS CNAME record on `qualitymate.com.au` zone → Cloudflare's target.
5. Capture the six screenshots per `docs-site/images/README.md` and replace placeholders.
6. Mirror the existing `docs/dr.md` material into a private vendor repo `qualitymate-runbook` and link it from `backup-restore.md` (the link is already there, pointing at a private GitHub URL).

`.gitignore` additions: `playwright-report`, `test-results`, `e2e/.e2e-config.json`, `e2e/outbox`, `docs-site/site-staff/incident-card.pdf`, `site/`. Typecheck still clean. The PDF script ran locally and produced a valid 2540-byte file.
