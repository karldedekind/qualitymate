# QualityMate — Deployment SOP

How to launch QualityMate on a fresh Linux server. Self-hosted, Docker-based.
Written from the production deploy on 2026-06-29 (host "RIMProject"), including
the real pitfalls hit along the way.

---

## 0. What you're deploying

- **App**: Next.js (standalone) in Docker, listens on port **3000** (bound to loopback).
- **Database**: PostgreSQL 16 in Docker, data on a host volume. Migrations run
  automatically on container start (`scripts/entrypoint.sh`).
- **TLS / public access**: a **reverse proxy on the host** terminates HTTPS and
  forwards to `127.0.0.1:3000`. The app container is **never exposed directly**.
- **Backups**: cron inside the container writes to `./data/backups` (daily/weekly,
  with retention tiers).

```
Internet ──(443)──▶ Reverse proxy (Apache/Caddy/nginx, TLS) ──▶ 127.0.0.1:3000 ──▶ app container ──▶ db container
```

---

## 1. Prerequisites

- A Linux server (Ubuntu 22.04 used in prod) with **root/sudo**.
- **Docker + Docker Compose plugin**: `docker --version && docker compose version`.
- A **domain** with an **A record → the server's public IP**.
- A **public, routable IP** with **inbound TCP 80 + 443 reachable from the internet**:
  - Cloud VPS: open 80/443 in the provider's firewall/security group.
  - Self-host behind a router: static public IP (no CGNAT), router **port-forward
    80+443 → the server's LAN IP**, and a **DHCP reservation** so the LAN IP is stable.
  - **Confirm inbound actually works** before requesting a cert (see §7, "inbound").

> The correct source repo is **`github.com/karldedekind/qualitymate`**.
> (Do not use the org repo `RIM-Admin/QualityMate-QMS` — it's a different/older
> codebase with no deploy infra.)

---

## 2. Get the code

```
git clone https://github.com/karldedekind/qualitymate qualitymate
cd qualitymate
ls compose.yaml .env.example Dockerfile   # sanity check — all three must exist
```

Private repo → authenticate with a GitHub Personal Access Token (`repo` scope).

---

## 3. Configure `.env`

```
cp .env.example .env
# generate secrets:
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # INSTALL_PASSPHRASE
openssl rand -base64 24   # RECOVERY_PASSPHRASE
```

Edit `.env` and set:

| Key | Value | Notes |
|-----|-------|-------|
| `BETTER_AUTH_SECRET` | the 1st random string | **Required.** Session-signing secret. |
| `INSTALL_PASSPHRASE` | the 2nd random string | **Required. Never change after first boot** — it's the encryption-at-rest key for stored settings (SMTP/AI/S3 creds). Save it offline. |
| `RECOVERY_PASSPHRASE` | the 3rd random string | Recovers `/setup` if all admins are lost. Store offline. |
| `BETTER_AUTH_URL` | `https://your.domain` | Must be **https** for a real host. |
| `APP_URL` | `https://your.domain` | Drives QR posters, email links, PDFs. Must be https. |

Leave `DATABASE_URL`, `UPLOADS_DIR`, `APP_IMAGE`, Watchtower lines as-is unless
you have a reason to change them.

> **Boot validation** (`src/lib/validate-env.ts`) will **refuse to start** if
> `BETTER_AUTH_SECRET` is missing/the dev default, or if the URLs are a real host
> on plain `http://`. Compose also hard-fails if `BETTER_AUTH_SECRET` or
> `INSTALL_PASSPHRASE` are unset (`${VAR:?...}`).

Verify (masks secrets):
```
grep -E '^(BETTER_AUTH_SECRET|INSTALL_PASSPHRASE|RECOVERY_PASSPHRASE|BETTER_AUTH_URL|APP_URL)=' .env | sed -E 's/=(.{0,6}).*/=\1…/'
```

---

## 4. Build & start

**Always build from source** — do not rely on the prebuilt GHCR image, which can
lag the working tree (a stale image causes "Failed to find Server Action" errors).

```
sudo docker compose up -d --build
```

Verify:
```
sudo docker compose ps                         # db healthy, app Up, port 127.0.0.1:3000
sudo docker compose logs --tail=30 app         # migrations applied, "starting server", "Ready"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000   # 307 (→ /setup) = alive
```

---

## 5. DNS

Point the domain at the server's public IP (A record for both apex and `www`):
```
dig +short your.domain          # must return the server's public IP
```
DNS can take minutes–hours to propagate. Cert issuance (§6) needs this live.

---

## 6. Reverse proxy + HTTPS

Pick the option that matches the server.

### Option A — Apache (used in prod; ideal if Apache already runs another app)

Modules needed (Ubuntu): `proxy proxy_http ssl headers rewrite` —
`sudo a2enmod proxy proxy_http ssl headers rewrite && sudo systemctl reload apache2`.

Create `/etc/apache2/sites-available/qualitymate.conf`:
```apache
<VirtualHost *:80>
    ServerName your.domain
    ServerAlias www.your.domain

    ProxyPreserveHost On
    ProxyPass /.well-known/acme-challenge/ !
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    RequestHeader set X-Forwarded-Proto "http"

    ErrorLog ${APACHE_LOG_DIR}/qualitymate-error.log
    CustomLog ${APACHE_LOG_DIR}/qualitymate-access.log combined
</VirtualHost>
```
Enable + get the cert:
```
sudo a2ensite qualitymate.conf
sudo apache2ctl configtest && sudo systemctl reload apache2      # must say "Syntax OK"
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d your.domain -d www.your.domain --redirect --agree-tos -m you@example.com --no-eff-email
```
After certbot, fix the proto header in the generated SSL vhost (certbot copies the
`http` one):
```
sudo sed -i 's/X-Forwarded-Proto "http"/X-Forwarded-Proto "https"/' /etc/apache2/sites-available/qualitymate-le-ssl.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
```
> Coexisting with another app on the same Apache (e.g. OpenProject): this is an
> **additive** vhost — don't touch the other site's config. Apache routes by
> `ServerName`, so each domain hits its own app.

### Option B — Caddy (simplest on a server with nothing else on 80/443)

`Caddyfile`:
```
your.domain {
    reverse_proxy 127.0.0.1:3000
}
```
`caddy run` (or the Caddy service). Caddy auto-provisions Let's Encrypt TLS and
sets `X-Forwarded-*` correctly. Make sure nothing else binds 80/443.

### Verify
```
curl -sI https://your.domain | head -3     # 307 (valid cert, no error)
curl -sI http://your.domain  | head -3     # 301 → https
```

---

## 7. First run

Open `https://your.domain` → the **`/setup`** wizard (runs once):
1. Company name / short name / brand colour.
2. Create the first **admin** (name, email, password ≥ 8 chars).

Then sign in. **Admins are required to enrol MFA** → you'll be sent to
`/account/security/setup`: scan the TOTP QR with an authenticator app and
**save the recovery codes offline**.

Then in **Admin → Settings**: logo, SMTP (emails + weekly backup), AI key
(optional), management rep. Set `WEEKLY_BACKUP_RECIPIENT` in `.env` for the
emailed backup copy.

---

## 8. Updating

```
cd <repo>
git pull
sudo docker compose up -d --build      # rebuild from source
```
Migrations apply automatically on start. (Watchtower, if enabled, auto-updates the
*image* monthly — but the source-build flow above is authoritative.)

## 9. Backups & data

- All persistent state lives under the host **`./data/`** (`postgres/`, `uploads/`,
  `backups/`). **Back this directory up off-server.**
- In-container cron writes logical DB + uploads backups to `./data/backups` with
  retention. Restore tooling is in `src/lib/backup.ts`.

---

## 10. Troubleshooting (real issues hit in prod)

| Symptom | Cause | Fix |
|---|---|---|
| Site unreachable externally; `https://<public-ip>` times out from mobile data, but works on LAN | Inbound 80/443 not reaching the box (ISP block / CGNAT / no port-forward) | Open inbound at ISP + router. Test by loading `http://<public-ip>` from **mobile data** (not WiFi). If blocked permanently, use a **Cloudflare Tunnel** (outbound-only, needs domain on Cloudflare). |
| `certbot` fails: "Timeout during connect" on the challenge | Port 80 not reachable from the internet | Same as above — fix inbound 80 first, then re-run certbot. |
| Login page error "Failed to find Server Action … older or newer deployment" | Container running a **stale image** whose client/server builds mismatch | `sudo docker compose up -d --build` from current source (don't run the lagging GHCR image). |
| Login succeeds (303) but `/dashboard` loops back to `/login?next=…` | Auth gate not seeing the session cookie | Already fixed in `src/proxy.ts` (checks both `qm.*` and `__Secure-qm.*` cookie names — Better-Auth prefixes `__Secure-` over HTTPS). If you change the cookie prefix in `src/lib/auth.ts`, update `src/proxy.ts` to match. |
| App container exits immediately on boot | Missing/invalid env | Check `BETTER_AUTH_SECRET`, `INSTALL_PASSPHRASE` set; URLs are `https`. See `docker compose logs app`. |
| `docker` "permission denied" for your user | Not in docker group | Prefix `sudo`, or `sudo usermod -aG docker <user>` then re-login. |

---

## Quick reference (happy path)

```
git clone https://github.com/karldedekind/qualitymate qualitymate && cd qualitymate
cp .env.example .env                      # then set secrets + https URLs
sudo docker compose up -d --build
# DNS A record → server IP; ensure inbound 80/443 open
# reverse proxy (Apache/Caddy) → 127.0.0.1:3000, then certbot for TLS
# browse https://your.domain/setup → create admin → enrol MFA
```
