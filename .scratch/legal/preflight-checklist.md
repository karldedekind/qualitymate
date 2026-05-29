# Pre-launch legal & insurance checklist

> Off-repo HITL work. This file is a runbook, not a record. Capture the *outcomes* (signed EULA, insurance certificate, search results) in the private vendor repo, not here.

## 1. Trademark search — "QualityMate"

- [ ] **IP Australia** trademark search at <https://search.ipaustralia.gov.au/trademarks/search/quick>. Search for `QualityMate` exact + `Quality Mate` two-word + phonetic variants. Note classes that matter:
  - **Class 9** — downloadable software, SaaS platforms.
  - **Class 42** — software as a service, design and development of computer software.
  - **Class 35** — business management, quality control consultancy.
- [ ] If a conflict exists in any of these classes for an active mark, decide: (a) negotiate co-existence, (b) rebrand, or (c) accept narrow scope. Record decision.
- [ ] If clear, file an application yourself or through an attorney. Filing fee per class: ~$330 AUD as of writing.
- [ ] Capture the application number and outcome in the vendor runbook.

## 2. ASIC search

- [ ] **ASIC Connect** check at <https://connectonline.asic.gov.au> for:
  - Existing company names containing "QualityMate" or "Quality Mate".
  - Existing business names containing the same.
- [ ] If a registered business or company name exists, follow up: contact the holder, or rebrand.
- [ ] Register the business name (or new company) once cleared. Business-name registration fee: ~$44 (1 yr) / ~$102 (3 yr) AUD.

## 3. Domain search

- [ ] Confirm `qualitymate.com.au` ownership (RIM Construction). If not yet registered, register through an au-Domain Administration registrar (auDA).
- [ ] Reserve defensive domains: `qualitymate.au` (apex), `qualitymate.com`, `qualitymate.net.au`, `qualitymate.io`.
- [ ] Configure DNS to point at Cloudflare. Set up Pages custom domain (see workflows in `25` and `26`).

## 4. Professional indemnity insurance

- [ ] Approach two AU brokers (e.g. BizCover, Aon SME, Marsh) for quotes.
- [ ] Cover scope: **$2M–$5M aggregate**, occurrence basis preferred over claims-made for portability. Include:
  - Software development and licensing activities.
  - AI-assisted decision-support disclaimer aligned with EULA clause 6.
  - Breach of privacy / cyber liability extension (~$1M sub-limit).
- [ ] Ensure retroactive cover starts at the date the first paying customer is invoiced (back-date if needed).
- [ ] Bind cover **before** customer #2 onboards.
- [ ] File the certificate of currency in the vendor runbook. Set a calendar reminder for renewal 60 days before expiry.

## 5. EULA finalisation

- [ ] Take `EULA-DRAFT.md` (this directory) to a Queensland-admitted small-business / IT lawyer. Suggested reviewers:
  - Cooper Grace Ward, Brisbane.
  - Mills Oakley (Brisbane office) — tech practice.
  - Pinion Advisory if cost is a constraint (smaller-firm pricing).
- [ ] Have the lawyer:
  - Confirm clause 10 (liability cap) interacts correctly with the *Australian Consumer Law*.
  - Confirm clause 6 (AI clause) is enforceable as a customer warranty.
  - Ratify the governing-law and jurisdiction choice (QLD).
  - Add anything your specific business model requires (e.g. data-residency commitment, export-control disclaimer, anti-bribery).
- [ ] Engross final EULA, version it (`v1.0` first executed). Counter-sign on each customer order.
- [ ] File the executed PDF in the vendor runbook (private repo `qualitymate-runbook`), **not in this repo**.

## 6. Acceptance flow inside the app (later, optional)

Not required for v1 launch — first customers accept by signing the order confirmation. If this becomes operationally noisy, add an in-app EULA acknowledgement page on first admin login that records:

- User ID + email snapshot
- EULA version string
- Timestamp
- Audit log entry `eula.accepted`

Track that as a future issue, not part of this one.

## 7. Privacy collection statement (related, do not skip)

Australian sites collect personal information (signatures, names, contractor details) at site check-in. The Licensee owns this — but the Software's UI must surface a collection statement at the worker's first scan. Confirm with the lawyer whether a default statement should ship in the Software's check-in form, or whether the Licensee must configure their own. Capture decision in the EULA or privacy policy.

## 8. Customer #2 gate

The whole list must be **green** before customer #2 onboards. Customer #1 (RIM Construction itself) doesn't trigger insurance / EULA execution against a third party. The first paying *external* customer does.

- [ ] EULA executed with customer #2.
- [ ] PI insurance bound and active.
- [ ] Trademark + ASIC + domain searches recorded as clear (or rebrand decision recorded).
- [ ] Privacy collection statement settled.
