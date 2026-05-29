# PWA offline incident draft + photo queue (service worker + IndexedDB)

---
Status: done
---

## What to build

OfflineQueue client module backed by IndexedDB. Service worker registers and intercepts incident submissions when offline. On reconnect, sync flushes the queue with photos. User sees clear queued / submitting / submitted / failed status in the UI.

## Acceptance criteria

- [ ] App installable as PWA (manifest + icons)
- [ ] Submitting incident with no network persists draft to IndexedDB; UI shows "queued"
- [ ] On reconnect, queued incident submits automatically; photos upload
- [ ] Queued items survive browser restart
- [ ] User sees clear status (queued / submitting / submitted / failed)
- [ ] Test: client-side queue + flush trigger

## Blocked by

- `10-incidents-manual-flow.md`
