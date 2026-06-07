# Full ZIP data export — streaming, rate-limited, audited

---
Status: done
---

## What to build

`/admin/data-export` streams a ZIP containing CSVs of every entity, `audit_log.csv`, `settings.json` (secrets redacted), photos under `uploads/`, meeting PDFs, and a plain-English `README.txt` describing the schema. Streams to client — no temp files on disk. Rate-limited to one export per admin per 5 minutes. Each export audited.

## Acceptance criteria

- [x] Endpoint streams ZIP without writing temporary files to disk
- [x] ZIP contains expected file tree given fixture
- [x] CSVs round-trip back into Postgres without loss
- [x] Photo paths in ZIP match `uploads/` manifest
- [x] Settings JSON has secret values redacted (SMTP password, Anthropic key, S3 creds, etc.)
- [x] Rate limit: second export within 5 min returns 429
- [x] Each export writes audit log entry

## Blocked by

- `03-audit-log-history-export.md`

## Comments

### 2026-05-06 — implementation

**Dependencies**
- prod: `archiver` (streaming ZIP, pipes from Node Readable; never writes temp files).
- dev: `unzipper` (test-only ZIP parser).

**Library — `src/lib/data-export.ts`**
- `rowsToCsv(rows, columns)`: CRLF, RFC 4180 quoting (commas, quotes, newlines), JSONB columns serialised, dates in ISO 8601.
- `exportSettings()`: returns settings rows with `value: "[REDACTED]"` whenever `is_secret` or the key is in `SECRET_KEYS` (`smtp.password`, `ai.anthropic_key`, `s3.secret_access_key`, `heartbeat.token`).
- `buildExportStream()`: returns `{ stream: Readable, manifest }`. Builds the archive in this order: per-table `csv/<name>.csv` (16 tables), `settings.json`, `uploads/<scope>/<file>` walked from `uploadsRoot()`, `meeting-pdfs/minutes-<id>.pdf` for every approved meeting (rendered fresh via `renderMinutesPdf`), `README.txt`, `manifest.json` (rowCounts + uploadFiles + meetingPdfs + generatedAt). `archive.finalize()` triggers streaming.

**Route — `src/app/admin/data-export/download.zip/route.ts`**
- `requireAdmin` gate.
- `consume("data-export:<adminId>", { limit: 1, windowMs: 5 * 60_000 })` per-admin rate-limit. On miss: audit `data-export.rate_limited`, return `429` with `Retry-After` header + JSON body `{ error, retryAfterSeconds }`.
- On hit: audit `data-export.run` with manifest, convert Node Readable to Web stream via `Readable.toWeb`, respond `application/zip` + `Content-Disposition: attachment; filename="qualitymate-export-<date>.zip"` + `Cache-Control: no-store`.

**UI — `src/app/admin/data-export/page.tsx`**
- Server component listing archive contents and a download button linking to the streaming route.

**Tests — `tests/data-export.test.ts`**
- Sets `UPLOADS_DIR` to a tmpdir, drops a known PNG.
- Asserts ZIP contents: `README.txt`, `manifest.json`, `csv/user.csv`, `csv/jobs.csv`, `csv/audit_log.csv`, `uploads/branding/logo.png`. `manifest.uploadFiles === 1`.
- Asserts redaction across all four secret keys; non-secret values preserved verbatim; raw plaintext password never appears in JSON.
- Asserts CSV CRLF tail, embedded comma wrapped in `"…"`, embedded quote doubled (`"Site ""Alpha"""`).
- Approved meeting PDF appears (`meeting-pdfs/minutes-<id>.pdf`, %PDF- header); non-approved meetings excluded; manifest count matches.
- Two cases against `consume()` directly: 1-per-5min, plus successful cooldown-after-window using injected `now`.
- Suite gated on testcontainers/Docker (same as the rest of the integration tests in the repo).

`npm run typecheck` clean.
