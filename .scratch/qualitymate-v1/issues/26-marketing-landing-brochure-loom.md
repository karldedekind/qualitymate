# Marketing landing page + brochure PDF + Loom demo (HITL)

---
Status: done
---

## What to build

Marketing site at `qualitymate.com.au`: landing page, pricing page, demo Loom video (3-min target), contact form, downloadable PDF brochure. **HITL** — copy and video require user-authored content; agent assists with scaffolding only.

## Acceptance criteria

- [x] Landing page scaffolded (copy approval is HITL — owner reviews `marketing/index.html`)
- [x] Pricing page lists $3,500 licence / $600 support / $750 white-glove
- [x] Loom demo video embedded (placeholder embed; `marketing/index.html` SRC needs real Loom URL)
- [x] Contact form sends to vendor inbox (Cloudflare Pages Function via MailChannels)
- [x] Downloadable PDF brochure linked from landing page (`/qualitymate-brochure.pdf`)
- [ ] DNS for `qualitymate.com.au` configured (one-time manual: CNAME → Pages target)

## Blocked by

- `25-mkdocs-docs-staff-pdf-install-runbook.md`

## Comments

### 2026-05-06 — implementation (HITL — copy/video pending owner review)

**Static site (`marketing/`)**

- `index.html` — hero (h1 + lede), Loom embed iframe (placeholder `REPLACE_WITH_LOOM_ID`), 6-card feature grid, "Why self-hosted" panel, pricing summary CTA, footer. Sticky header with Q-mark brand badge. Links out to `https://docs.qualitymate.com.au` for the docs site.
- `pricing.html` — three-tier card layout: Licence $3,500 (highlighted styling on Support per AC pricing emphasis), Support $600/yr, White-glove $750. Five-question FAQ (`<details>` accordion).
- `contact.html` — name / company / email / phone / message form, hidden honeypot field, client-side `fetch("/contact")` JSON POST with status feedback. Falls back to mailto link.
- `styles.css` — hand-rolled (no Tailwind/CDN). CSS vars for primary `#1e40af`, ink `#0f172a`, muted `#475569`. Responsive grid via `auto-fit/minmax`. Mobile breakpoint at 600px reduces hero font size and wraps nav.

**Contact form backend**

- `marketing/functions/contact.ts` — Cloudflare Pages Function (`onRequestPost`). Reads JSON body, runs honeypot check (silently 200 if `website` field is filled), validates name/email/message lengths and email regex, sends via MailChannels API (`https://api.mailchannels.net/tx/v1/send` — free for Cloudflare-originated mail). `reply_to` is set to the submitter so vendor replies route correctly. `personalizations.to` defaults to `hello@rimconstruction.com.au` (overridable via `CONTACT_TO` env binding). `from` defaults to `no-reply@qualitymate.com.au` (overridable via `CONTACT_FROM`; must be a domain with MailChannels DNS verification). Returns `{ ok: true }` on success, plain-text error on validation/send failure.

**Brochure PDF**

- `scripts/build-brochure-pdf.ts` — pdfkit-driven 2-page A4: cover (logo wordmark, lede, feature grid as title/body pairs) + pricing page (three tiers with bullet lists, contact line). Generated locally: 4175 bytes. `npm run marketing:brochure`.
- Output `marketing/qualitymate-brochure.pdf` is gitignored — built in CI before deploy.

**Deploy workflow**

- `.github/workflows/marketing.yml` — push-to-`main` (and PRs touching marketing) triggers: Node 22, `npm ci`, `npm run marketing:brochure`, upload `marketing/` artifact (14-day retention), then on `main` deploy via `cloudflare/wrangler-action@v3` to `pages deploy marketing --project-name=qualitymate-marketing --branch=main`.
- Reuses the same `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets as the docs workflow.

**Outstanding manual / HITL steps**

1. Replace Loom iframe `SRC` in `marketing/index.html` with the production Loom share URL.
2. Owner-review pass on copy across `index.html`, `pricing.html`, `contact.html`, and the brochure script — adjust voice, claims, and pricing wording to match RIM's brand.
3. Create the `qualitymate-marketing` Cloudflare Pages project.
4. Add custom domain `qualitymate.com.au` in Pages → Custom domains; set the printed CNAME on the apex (Cloudflare-managed flattening makes this work) or `www.qualitymate.com.au` if apex is reserved for redirect.
5. Set up DNS records for MailChannels — add the SPF/DKIM TXT records Cloudflare prints; without them MailChannels will reject the `from` address.
6. Set `CONTACT_TO` / `CONTACT_FROM` env bindings on the Pages project if non-default values are required.

`npm run typecheck` clean. Brochure PDF builds (4175 bytes). Marketing site is plain HTML/CSS/JS — no build step beyond copying files plus generating the PDF.
