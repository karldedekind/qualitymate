# Meetings — attendee signoffs + director approval

---
Status: done
---

## What to build

Each meeting attendee signs off on the drafted minutes. Director (named role / specific user) approves the meeting. Signoff structure stored as JSONB with attendee, timestamp, IP. Approval state-locks the meeting — no further edits to minutes once approved.

## Acceptance criteria

- [x] Each attendee receives a signoff link / notification post-draft
- [x] Attendee signs off → entry recorded with timestamp + IP
- [x] Director-only approve action available once all signoffs collected
- [x] Approval locks the meeting; subsequent edit attempts rejected with clear error
- [x] Tests: signoff state machine, approval lock, only-director-can-approve

## Blocked by

- `14-meetings-schedule-pack-minutes.md`
