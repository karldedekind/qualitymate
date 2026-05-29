# Legal — EULA + PI insurance + trademark/ASIC/domain searches (HITL)

---
Status: ready-for-human
---

## What to build

EULA drafted by an AU small-business lawyer covering per-install scope, no-redistribution, no-warranty disclaimer, liability cap = fees paid in prior 12 months, governing law (QLD initially), and an explicit AI clause: "Customer warrants that AI suggestions are reviewed by a qualified person before action." Professional indemnity insurance ($2-5M) bound. Trademark + ASIC + domain searches conducted before launch — rebrand if conflict found. **HITL** — entirely off-repo work.

## Acceptance criteria

- [ ] EULA template signed off by lawyer; checked into private vendor repo (draft prepared — see `.scratch/legal/EULA-DRAFT.md`; lawyer review still required)
- [ ] PI insurance bound; certificate filed (broker outreach steps documented in checklist)
- [ ] Trademark search clean (or rebrand decision recorded) for "QualityMate" (search procedure documented; execution pending)
- [ ] ASIC and domain searches clean (search procedure documented; execution pending)
- [ ] All bound before customer #2 onboards (gate documented)

## Blocked by

None — HITL, parallel with all engineering work.

## Comments

### 2026-05-06 — implementation (HITL — agent provides drafts only)

This issue is entirely off-repo legal/insurance work. Agent cannot bind insurance, retain a lawyer, or run a trademark search. Two artifacts produced as starting points the owner takes through the actual legal process:

**`.scratch/legal/EULA-DRAFT.md`** — first-draft EULA template. Marked **DRAFT — NOT LEGAL ADVICE** at the top. 14 clauses covering:

- Definitions; one-Install one-entity scope (clause 2).
- No redistribution / no SaaS resale / no third-party hosting (clause 2.2).
- Source-code access for licensees (clause 3) — locks operational use even if source is shared.
- Customer-Data ownership and Licensee privacy responsibility (clause 5), including biometric (signature) and Privacy Act 1988 references.
- **AI clause** (clause 6.3) — explicit Licensee warranty that AI suggestions are reviewed by a qualified person before action; covers incident triage, meeting pack, meeting minutes drafts; states no AI suggestion alone is a quality/safety/compliance decision.
- ISO 9001 disclaimer (clause 7).
- Warranties / "as is" with ACL non-excludable carve-out (clause 9).
- **Liability cap** (clause 10.1) — aggregate liability capped at fees paid in prior 12 months. Excludes indirect/consequential. ACL carve-out preserved.
- Indemnity (clause 11).
- Termination on uncured material breach (clause 12).
- **Governing law: Queensland**, exclusive jurisdiction (clause 13).
- Boilerplate (notices, assignment, force majeure, entire agreement, severability).
- Two signature blocks.

**`.scratch/legal/preflight-checklist.md`** — operational runbook covering:

1. **Trademark search** — IP Australia, classes 9 / 35 / 42 with rationale, fee notes, decision flow if conflict found.
2. **ASIC search** — ASIC Connect for company + business name, fee notes, registration steps.
3. **Domain search** — `.com.au` confirmation, defensive registrations (`.au`, `.com`, `.net.au`, `.io`), Cloudflare DNS handover.
4. **Professional indemnity insurance** — broker shortlist (BizCover, Aon SME, Marsh), $2M–$5M aggregate scope, AI / privacy cyber sub-limit, retroactive-cover gating, certificate filing in vendor runbook, renewal calendar reminder.
5. **EULA finalisation** — Queensland lawyer shortlist, three review focus points (ACL/cap interaction, AI-clause enforceability, governing law), versioning model, file final in private vendor repo (not this repo).
6. **In-app EULA acceptance** — out-of-scope for this issue; flagged as a separate future ticket.
7. **Privacy collection statement** — open question for the lawyer regarding default UI text on the check-in form.
8. **Customer #2 gate** — explicit checklist of items that must be green before any external customer onboards.

### Why these aren't in `legal/` at the repo root

The AC requires the **executed** EULA and certificate to live in the private vendor repo (`qualitymate-runbook`). Putting drafts under `.scratch/legal/` keeps work-in-progress visible without committing them as if they were the real thing. Once the lawyer signs off, the executed PDF and these working files should move to the private repo and be deleted here.

### Honest scope

Acceptance criteria stay **unchecked** because the artifacts above are starting points, not signed-off deliverables. This issue is `ready-for-human` in the sense that the next step is yours: take the draft to a Queensland-admitted lawyer, get quotes from two PI brokers, run the IP/ASIC/domain searches yourself, and check the boxes once each is genuinely done.
