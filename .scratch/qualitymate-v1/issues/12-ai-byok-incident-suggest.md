# AI BYOK + suggestStructure on incident review (gates UI, audited)

---
Status: done
---

## What to build

Anthropic API key in admin settings (encrypted at rest). On save, validation probe call confirms the key works before persisting. AI module exposes `suggestStructure(incident)` and `isConfigured()`. UI shows "Suggest" button on incident review only when `isConfigured()` returns true. Returned suggestions surfaced as suggestions, never auto-applied. Each AI call recorded in audit log.

## Acceptance criteria

- [ ] Admin pastes Anthropic key; settings validates with probe call before save
- [ ] Invalid key shows clear error; not persisted
- [ ] When configured, "Suggest" button on incident review surfaces root cause, priority, category
- [ ] Admin can apply or override each field independently
- [ ] When key absent, "Suggest" button does not render; manual fields fully functional
- [ ] Each AI call writes audit log entry (prompt+response references, not full content)
- [ ] Test: stub Anthropic transport; malformed JSON handled; `isConfigured()==false` when no key; never throws to caller

## Blocked by

- `02-settings-branding.md`
- `10-incidents-manual-flow.md`
