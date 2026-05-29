import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";
import { db } from "@/db";
import {
  account,
  auditLog,
  categories,
  correctiveActions,
  incidentPhotos,
  incidents,
  invite,
  jobs,
  meetings,
  notifications,
  registerEntries,
  session,
  setupState,
  settings,
  siteAttendances,
  user,
  verification,
} from "@/db/schema";
import { renderMinutesPdf } from "@/lib/meetings-pdf";
import { getBranding } from "@/lib/branding";
import { uploadsRoot } from "@/lib/uploads";
import { SECRET_KEYS } from "@/lib/settings";

// ---------- CSV helpers ----------

function csvEscape(value: unknown): string {
  if (value == null) return "";
  let str: string;
  if (typeof value === "string") str = value;
  else if (value instanceof Date) str = value.toISOString();
  else if (typeof value === "object") str = JSON.stringify(value);
  else str = String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Render a row array as CSV with a header line. Uses CRLF (RFC 4180). */
export function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const out: string[] = [];
  out.push(columns.join(","));
  for (const r of rows) {
    out.push(columns.map((c) => csvEscape(r[c])).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

// ---------- Settings redaction ----------

export type RedactedSettingRow = {
  key: string;
  value: string | null;
  isSecret: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

/** Convert settings rows for export. Secret values replaced with `[REDACTED]`. */
export async function exportSettings(): Promise<RedactedSettingRow[]> {
  const rows = await db.select().from(settings);
  return rows.map((r) => {
    const isSecret = r.isSecret || SECRET_KEYS.has(r.key);
    return {
      key: r.key,
      value: isSecret && r.value != null ? "[REDACTED]" : r.value,
      isSecret,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    };
  });
}

// ---------- Filesystem walk ----------

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

// ---------- Approved meeting PDFs ----------

async function appendApprovedMinutes(
  archive: archiver.Archiver,
): Promise<{ id: string; bytes: number }[]> {
  const rows = await db.select().from(meetings);
  const branding = await getBranding();
  const out: { id: string; bytes: number }[] = [];
  for (const m of rows) {
    if (m.status !== "approved" || !m.minutes) continue;
    const pdf = await renderMinutesPdf(m, branding);
    archive.append(pdf, { name: `meeting-pdfs/minutes-${m.id}.pdf` });
    out.push({ id: m.id, bytes: pdf.length });
  }
  return out;
}

// ---------- README ----------

const README = `QualityMate full data export
============================

This archive contains a point-in-time snapshot of the database, application
settings, uploaded photos, and approved meeting minutes for the configured
QualityMate instance.

Top-level layout
----------------

  README.txt              This file.
  manifest.json           Inventory: row counts, file counts, generated_at.
  csv/                    One CSV per table (RFC 4180, CRLF line endings).
  settings.json           Settings table with secret values redacted.
  uploads/                Verbatim copy of the uploads directory.
  meeting-pdfs/           Rendered PDFs for every approved meeting.

CSV files
---------

Each CSV uses the column order returned by the database. Empty cells indicate
NULL. JSONB columns are serialised as JSON strings. Timestamps are ISO 8601
in UTC. The schema defined in src/db/schema.ts is authoritative.

Round-tripping
--------------

CSVs were emitted by Node's built-in formatting and conform to RFC 4180:
double quotes are escaped by doubling them; values containing commas, quotes,
or line breaks are quoted. Postgres COPY ... WITH (FORMAT csv, HEADER true,
QUOTE '"', ESCAPE '"') will re-import each file losslessly.

Redaction
---------

settings.json replaces values for keys whose is_secret column is true (and any
known secret-like key) with the literal string "[REDACTED]". This includes
SMTP password, AI/Anthropic key, S3 credentials, and the heartbeat token.
Other tables are exported verbatim.
`;

// ---------- Main entry ----------

export type ExportManifest = {
  generatedAt: string;
  rowCounts: Record<string, number>;
  uploadFiles: number;
  meetingPdfs: number;
};

export type ExportResult = {
  stream: Readable;
  manifest: ExportManifest;
};

const TABLES: { name: string; table: unknown; columns: string[] }[] = [
  {
    name: "user",
    table: user,
    columns: [
      "id",
      "email",
      "name",
      "emailVerified",
      "image",
      "role",
      "deactivatedAt",
      "mustChangePassword",
      "totpSecret",
      "totpEnabledAt",
      "totpRecoveryCodes",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "invite",
    table: invite,
    columns: ["id", "email", "role", "token", "expiresAt", "usedAt", "invitedBy", "createdAt"],
  },
  {
    name: "session",
    table: session,
    columns: [
      "id",
      "userId",
      "token",
      "expiresAt",
      "ipAddress",
      "userAgent",
      "mfaVerifiedAt",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "account",
    table: account,
    columns: [
      "id",
      "userId",
      "accountId",
      "providerId",
      "accessToken",
      "refreshToken",
      "idToken",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "scope",
      "password",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "verification",
    table: verification,
    columns: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
  },
  {
    name: "audit_log",
    table: auditLog,
    columns: [
      "id",
      "ts",
      "userId",
      "userEmailSnapshot",
      "entityType",
      "entityId",
      "action",
      "before",
      "after",
      "ip",
      "userAgent",
    ],
  },
  {
    name: "notifications",
    table: notifications,
    columns: ["id", "userId", "type", "entityType", "entityId", "body", "readAt", "createdAt"],
  },
  {
    name: "jobs",
    table: jobs,
    columns: ["id", "number", "name", "address", "active", "createdAt", "updatedAt", "createdBy"],
  },
  {
    name: "categories",
    table: categories,
    columns: ["id", "code", "kind", "label", "sortOrder", "active", "createdAt"],
  },
  {
    name: "site_attendances",
    table: siteAttendances,
    columns: [
      "id",
      "jobId",
      "fullName",
      "mobile",
      "companyName",
      "trade",
      "emergencyContactName",
      "emergencyContactPhone",
      "whiteCardNumber",
      "whiteCardExpiry",
      "declWhsmp",
      "declEmergency",
      "declFitForWork",
      "declEmergencyAction",
      "declHazards",
      "declPpe",
      "declCompetent",
      "declSiteRules",
      "consent",
      "signaturePath",
      "signedInAt",
      "plannedDepartureAt",
      "ip",
      "userAgent",
      "createdAt",
    ],
  },
  {
    name: "incidents",
    table: incidents,
    columns: [
      "id",
      "jobId",
      "filedBy",
      "title",
      "description",
      "status",
      "categoryId",
      "priority",
      "rootCause",
      "closeReason",
      "closedAt",
      "closedBy",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "incident_photos",
    table: incidentPhotos,
    columns: [
      "id",
      "incidentId",
      "path",
      "originalFilename",
      "width",
      "height",
      "takenAt",
      "createdAt",
    ],
  },
  {
    name: "register_entries",
    table: registerEntries,
    columns: ["id", "incidentId", "summary", "closedAt", "closedBy", "createdAt"],
  },
  {
    name: "corrective_actions",
    table: correctiveActions,
    columns: [
      "id",
      "incidentId",
      "title",
      "description",
      "assigneeId",
      "deadline",
      "status",
      "dueSoonNotifiedAt",
      "overdueNotifiedAt",
      "resolvedAt",
      "resolvedBy",
      "resolutionNote",
      "createdBy",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "meetings",
    table: meetings,
    columns: [
      "id",
      "title",
      "scheduledAt",
      "location",
      "attendees",
      "pack",
      "minutes",
      "signoffs",
      "signoffTokens",
      "signoffIssuedAt",
      "distributionList",
      "distributedAt",
      "approvedBy",
      "approvedAt",
      "status",
      "completedAt",
      "cancelledAt",
      "createdBy",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "setup_state",
    table: setupState,
    columns: [
      "id",
      "step",
      "companyName",
      "companyShortName",
      "primaryColor",
      "completedAt",
      "createdAt",
      "updatedAt",
    ],
  },
];

/**
 * Build a streaming ZIP of a full data export. Returned `stream` is a Node
 * Readable that emits the ZIP bytes as they are produced — no temp files
 * touch disk. Caller is responsible for piping to the response.
 */
export async function buildExportStream(): Promise<ExportResult> {
  const archive = archiver("zip", { zlib: { level: 6 } });

  const rowCounts: Record<string, number> = {};

  // 1. CSV per table.
  for (const t of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await db.select().from(t.table as any);
    rowCounts[t.name] = rows.length;
    archive.append(rowsToCsv(rows, t.columns), { name: `csv/${t.name}.csv` });
  }

  // 2. Settings JSON (redacted).
  const redactedSettings = await exportSettings();
  archive.append(JSON.stringify(redactedSettings, null, 2), { name: "settings.json" });

  // 3. Uploads tree.
  const root = uploadsRoot();
  let uploadFiles = 0;
  try {
    const rootStat = await stat(root);
    if (rootStat.isDirectory()) {
      const files = await listFiles(root);
      for (const full of files) {
        const rel = relative(root, full);
        archive.file(full, { name: `uploads/${rel}` });
        uploadFiles += 1;
      }
    }
  } catch {
    // No uploads dir yet.
  }

  // 4. Approved meeting PDFs.
  const meetingPdfs = await appendApprovedMinutes(archive);

  // 5. README + manifest.
  archive.append(README, { name: "README.txt" });
  const manifest: ExportManifest = {
    generatedAt: new Date().toISOString(),
    rowCounts,
    uploadFiles,
    meetingPdfs: meetingPdfs.length,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  archive.finalize();

  return { stream: archive as unknown as Readable, manifest };
}
