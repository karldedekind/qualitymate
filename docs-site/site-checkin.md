# Site Check-in

The QR-driven attendance log. No login required for the worker — only the supervisor.

## How it works

1. Each active job has a printable QR poster (Admin → Jobs → click job → **Print QR**).
2. Worker scans the poster with their phone camera.
3. Worker fills a short form: company (or pick from list), name, role.
4. Worker signs on screen.
5. The check-in is recorded against that job for today's date.
6. The supervisor for that job reviews and signs off the daily roster.

## Worker view

![Check-in form](images/checkin-form.png)

- **Company** — predictive autocomplete from previously-used names. Pick an existing one or type a new one.
- **Name** — prefilled from cookie if they've checked in before on this device.
- **Role** — labourer, electrician, plumber, etc. Free text.
- **Signature** — finger-draw on screen.

After submit they see a thank-you page. No account, no password.

## Supervisor view

Each job has a supervisor URL accessible only to logged-in supervisors:

```
${APP_URL}/roster/<jobId>
```

Today's check-ins appear in real time. Supervisor:

1. Reviews the list.
2. Signs the day off — that's their attestation that the people listed were actually there.

## Anomalies

A nightly scan (`npm run scan:anomalies`) flags jobs where:

- More than 30% of check-ins came from "unknown" companies (new names not on the existing list).

Admins are notified so they can either add the new company to the canonical list or follow up.

## QR poster

See [Admin Guide → QR poster](admin-guide.md#qr-poster) for printing instructions.
