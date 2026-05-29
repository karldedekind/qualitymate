# Meetings — schedule + AI pre-pack + AI draft minutes (with manual fallback)

---
Status: done
---

## What to build

Admin schedules quarterly management review meetings. Meetings module: `schedule(input)`, `generatePack(id)`, `draftMinutes(id)`. AI generates pre-meeting pack (summary of incidents, actions, trends for quarter) and drafts minutes after the meeting. Manual editing always available. AI affordances hidden when AI not configured — manual composition still works (degrade gracefully per PRD).

## Acceptance criteria

- [ ] Admin schedules meeting with attendees, date, time
- [ ] "Generate pre-pack" button calls AI when configured; renders editable pack
- [ ] When AI not configured, admin composes pack manually; same UI without AI button
- [ ] "Draft minutes" button calls AI on completed meeting; renders editable minutes
- [ ] Pack and minutes persist as JSONB on meeting row
- [ ] Tests: schedule create, manual fallback path, AI path with stub Anthropic transport

## Blocked by

- `13-corrective-actions-cron-scans.md`
