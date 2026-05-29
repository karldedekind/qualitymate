# Setup

Stand up a fresh QualityMate install in under 30 minutes.

## Prerequisites

- A Linux host with Docker and Docker Compose v2.
- A public DNS record pointing at the host (for the app URL).
- A reverse proxy that terminates TLS (Caddy, Traefik, or nginx).
- 2 GB RAM, 2 vCPUs, 20 GB disk minimum.

## Step 1 — Pull the compose stack

```bash
git clone https://github.com/karldedekind/qualitymate.git
cd qualitymate
cp .env.example .env
```

Edit `.env`. The required fields are:

| Key | Notes |
|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `INSTALL_PASSPHRASE` | `openssl rand -base64 32` — encryption-at-rest key. Losing it makes encrypted settings unreadable. |
| `RECOVERY_PASSPHRASE` | `openssl rand -base64 24` — re-bootstrap unlock. |
| `APP_URL` | Public HTTPS URL of your install. |
| `BETTER_AUTH_URL` | Same as `APP_URL`. |

## Step 2 — Boot the stack

```bash
docker compose up -d
```

Migrations run on container boot. The HTTP server only starts after migrations succeed.
Check logs:

```bash
docker compose logs -f app
```

## Step 3 — First admin

Visit `${APP_URL}` in a browser. The setup wizard runs once:

![Setup wizard](images/setup-wizard.png)

Fill in:

- **Company name** — appears on PDFs and emails.
- **Short name** — used in the header badge.
- **Primary colour** — hex. Sets buttons, headings.
- **First admin** — name, email, password. This is the only admin until you invite more.

Click **Complete setup**. You'll be redirected to `/login`.

## Step 4 — Verify and configure

Sign in. Navigate to **Settings** in the admin nav and configure:

- **SMTP** — host, port, user, password, from-address. Click **Send test** before saving.
- **AI** (optional) — Anthropic API key. Click **Probe** to verify.
- **S3** (optional, for offsite backups) — endpoint, region, bucket, keys. Click **Test push**.
- **Heartbeat** (optional) — opt in to send anonymous health pings to RIM Construction.

## Step 5 — Invite users

**Users → Invite**. Enter email + role (`admin` or `site_staff`). The invitee gets an email with a token URL valid for 7 days.

## Step 6 — Schedule cron

Add to host crontab:

```
0 8 * * *   cd /opt/qualitymate && docker compose exec -T app npm run scan:anomalies
0 * * * *   cd /opt/qualitymate && docker compose exec -T app npm run scan:actions
0 * * * *   cd /opt/qualitymate && docker compose exec -T app npm run heartbeat:tick
0 2 * * *   cd /opt/qualitymate && docker compose exec -T app npm run backup
0 3 * * 1   cd /opt/qualitymate && docker compose exec -T app npm run backup:weekly-email
```

Done. See the [Admin Guide](admin-guide.md) for daily operations.
