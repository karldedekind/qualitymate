# Incidents — file with photos, my-list, admin review, close, register entry

---
Status: done
---

## What to build

Site staff files incident from any device with photo upload (sharp resize to 1920px max wide, EXIF date preserved, mobile camera capture via `<input capture="environment">`). My-list view shows incidents I filed. Admin reviews pending → close manually with reason. Register entry created on close. Status transitions enforced (`pending_review` → `open` → `closed`); illegal transitions rejected. **No AI yet** — that lands in slice 12.

## Acceptance criteria

- [x] `/incidents/new` lets any authenticated user file incident with multiple photos
- [x] Photos resized to max 1920px wide; EXIF date preserved
- [x] `/incidents/mine` shows incidents filed by current user
- [x] Admin review screen lists pending incidents
- [x] Admin can close an incident with a reason; register entry created with linkage
- [x] Status transitions `pending_review`→`open`→`closed` succeed via legal paths only
- [x] Photos stored at `data/uploads/incidents/{id}/{uuid}.{ext}`
- [x] Tests: status transition matrix, register entry on close, photo path scheme

## Blocked by

- `04-user-management.md`
