import { createReadStream, createWriteStream } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import postgres, { type Sql } from "postgres";
import * as tar from "tar";

const TABLES_IN_RESTORE_ORDER = [
  "user",
  "invite",
  "session",
  "account",
  "verification",
  "audit_log",
  "settings",
  "notifications",
  "jobs",
  "categories",
  "site_attendances",
  "incidents",
  "incident_photos",
  "register_entries",
  "corrective_actions",
  "meetings",
  "setup_state",
];

export const BACKUP_FILENAME_RE = /^qualitymate-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.tar\.gz$/;

export function timestampForFilename(d: Date = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
}

export type BackupManifest = {
  generatedAt: string;
  tables: string[];
  uploadsFiles: number;
  schemaVersionFiles: string[];
  toolVersion: number;
};

export type CreateTarballInput = {
  databaseUrl: string;
  uploadsDir: string;
  migrationsDir: string;
  outFile: string;
};

export type CreateTarballResult = {
  outFile: string;
  bytes: number;
  manifest: BackupManifest;
};

/**
 * Logical backup: dumps every table via COPY ... TO STDOUT (FORMAT csv, HEADER true)
 * into a tar.gz alongside the migrations dir and the uploads tree. Restoring
 * applies migrations first, then COPYs each CSV back in.
 */
export async function createTarball(input: CreateTarballInput): Promise<CreateTarballResult> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  const stage = await mkdtemp(join(tmpdir(), "qm-backup-"));
  try {
    // 1. Dump tables to CSV via COPY TO STDOUT.
    const dbDir = join(stage, "db");
    await mkdir(dbDir, { recursive: true });
    for (const t of TABLES_IN_RESTORE_ORDER) {
      const csvPath = join(dbDir, `${t}.csv`);
      await dumpTableCsv(sql, t, csvPath);
    }

    // 2. Copy migrations dir verbatim so a future restore knows the schema baseline.
    const migDir = join(stage, "migrations");
    await mkdir(migDir, { recursive: true });
    const migFiles: string[] = [];
    try {
      const entries = await readdir(input.migrationsDir);
      for (const f of entries) {
        if (!f.endsWith(".sql")) continue;
        await cp(join(input.migrationsDir, f), join(migDir, f));
        migFiles.push(f);
      }
    } catch {
      // No migrations dir: schema-less backup.
    }

    // 3. Uploads tree.
    let uploadsFiles = 0;
    try {
      const stagedUploads = join(stage, "uploads");
      await mkdir(stagedUploads, { recursive: true });
      uploadsFiles = await copyTree(input.uploadsDir, stagedUploads);
    } catch {
      uploadsFiles = 0;
    }

    // 4. Manifest.
    const manifest: BackupManifest = {
      generatedAt: new Date().toISOString(),
      tables: TABLES_IN_RESTORE_ORDER.slice(),
      uploadsFiles,
      schemaVersionFiles: migFiles.sort(),
      toolVersion: 1,
    };
    await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));

    // 5. Pack as tar.gz.
    await mkdir(dirname(input.outFile), { recursive: true });
    const entries = ["manifest.json", "db", "migrations", "uploads"].filter(
      async (e) => {
        try {
          await stat(join(stage, e));
          return true;
        } catch {
          return false;
        }
      },
    );
    void entries;
    await tar.create(
      { gzip: true, cwd: stage, file: input.outFile, portable: true },
      ["manifest.json", "db", "migrations", "uploads"],
    );
    const fileStat = await stat(input.outFile);
    return { outFile: input.outFile, bytes: fileStat.size, manifest };
  } finally {
    await sql.end({ timeout: 5 });
    await rm(stage, { recursive: true, force: true });
  }
}

async function dumpTableCsv(sql: Sql, table: string, outFile: string): Promise<void> {
  // postgres.js exposes a Readable for COPY TO STDOUT.
  const query = sql.unsafe(
    `COPY "${table}" TO STDOUT WITH (FORMAT csv, HEADER true, QUOTE '"', ESCAPE '"', FORCE_QUOTE *)`,
  );
  // `readable()` is the documented way to consume server output.
  const readable = await (query as unknown as { readable: () => Promise<NodeJS.ReadableStream> }).readable();
  const writable = createWriteStream(outFile);
  await pipeline(readable, writable);
}

async function loadTableCsv(sql: Sql, table: string, csvFile: string): Promise<number> {
  const query = sql.unsafe(
    `COPY "${table}" FROM STDIN WITH (FORMAT csv, HEADER true, QUOTE '"', ESCAPE '"')`,
  );
  const writable = await (query as unknown as { writable: () => Promise<NodeJS.WritableStream> }).writable();
  const readable = createReadStream(csvFile);
  await pipeline(readable, writable);
  // Count rows for telemetry.
  const r = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  return Number((r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
}

async function copyTree(src: string, dst: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(src, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const sFull = join(src, e.name);
    const dFull = join(dst, e.name);
    if (e.isDirectory()) {
      await mkdir(dFull, { recursive: true });
      count += await copyTree(sFull, dFull);
    } else if (e.isFile()) {
      await mkdir(dirname(dFull), { recursive: true });
      await cp(sFull, dFull);
      count += 1;
    }
  }
  return count;
}

export type RestoreTarballInput = {
  databaseUrl: string;
  uploadsDir: string;
  migrationsDir: string;
  tarFile: string;
};

export type RestoreTarballResult = {
  manifest: BackupManifest;
  rowsRestored: Record<string, number>;
  uploadsRestored: number;
};

/**
 * Restore from a tarball. Applies any missing migrations first, then truncates
 * each table and COPYs the CSV back in. Replaces uploads dir contents.
 */
export async function restoreTarball(
  input: RestoreTarballInput,
): Promise<RestoreTarballResult> {
  const stage = await mkdtemp(join(tmpdir(), "qm-restore-"));
  try {
    await tar.extract({ file: input.tarFile, cwd: stage });

    const manifest = JSON.parse(
      await readFile(join(stage, "manifest.json"), "utf-8"),
    ) as BackupManifest;

    // Apply migrations baseline if a migrations bundle is present.
    const stagedMig = join(stage, "migrations");
    let migrationsToRun = input.migrationsDir;
    try {
      await stat(stagedMig);
      migrationsToRun = stagedMig;
    } catch {
      // fall back to local migrations dir
    }
    const { runMigrations } = await import("@/db/migrate");
    // runMigrations reads from the on-disk dir hard-coded relative to the module;
    // copy bundled SQL into that dir before running so an old backup can re-create
    // its expected schema.
    await syncDir(migrationsToRun, input.migrationsDir);
    await runMigrations(input.databaseUrl);

    // Restore data.
    const sql = postgres(input.databaseUrl, { max: 1 });
    const rowsRestored: Record<string, number> = {};
    try {
      // Disable FK/triggers during bulk load.
      await sql.unsafe(`SET session_replication_role = replica`);

      // Truncate in reverse FK order, then load in forward order.
      const reverse = [...manifest.tables].reverse();
      for (const t of reverse) {
        await sql.unsafe(`TRUNCATE "${t}" RESTART IDENTITY CASCADE`);
      }
      for (const t of manifest.tables) {
        const csv = join(stage, "db", `${t}.csv`);
        try {
          await stat(csv);
        } catch {
          continue;
        }
        rowsRestored[t] = await loadTableCsv(sql, t, csv);
      }

      // Re-sync sequences for tables with serial primary keys.
      for (const t of manifest.tables) {
        await resyncSerialSequences(sql, t);
      }

      await sql.unsafe(`SET session_replication_role = DEFAULT`);
    } finally {
      await sql.end({ timeout: 5 });
    }

    // Restore uploads.
    let uploadsRestored = 0;
    const stagedUploads = join(stage, "uploads");
    try {
      await stat(stagedUploads);
      await rm(input.uploadsDir, { recursive: true, force: true });
      await mkdir(input.uploadsDir, { recursive: true });
      uploadsRestored = await copyTree(stagedUploads, input.uploadsDir);
    } catch {
      uploadsRestored = 0;
    }

    return { manifest, rowsRestored, uploadsRestored };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function syncDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const want = new Set<string>();
  try {
    const entries = await readdir(src);
    for (const f of entries) {
      if (!f.endsWith(".sql")) continue;
      want.add(f);
      await cp(join(src, f), join(dst, f), { force: true });
    }
  } catch {
    // src missing — nothing to copy
  }
}

async function resyncSerialSequences(sql: Sql, table: string): Promise<void> {
  // Only run for tables we know have a `serial` PK (`audit_log`, `notifications`).
  if (table !== "audit_log" && table !== "notifications") return;
  await sql.unsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
                   COALESCE((SELECT MAX(id) FROM "${table}"), 1),
                   (SELECT MAX(id) IS NOT NULL FROM "${table}"))`,
  );
}

// ---------- Listing + retention ----------

export type BackupFile = {
  name: string;
  fullPath: string;
  size: number;
  mtime: Date;
  takenAt: Date;
};

export async function listBackups(dir: string): Promise<BackupFile[]> {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: BackupFile[] = [];
  for (const name of entries) {
    const m = BACKUP_FILENAME_RE.exec(name);
    if (!m) continue;
    const full = join(dir, name);
    const s = await stat(full);
    const isoLike = m[1]!.replace(
      /T(\d{2})-(\d{2})-(\d{2})/,
      "T$1:$2:$3",
    );
    const takenAt = new Date(isoLike);
    out.push({ name, fullPath: full, size: s.size, mtime: s.mtime, takenAt });
  }
  out.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
  return out;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoWeekKey(d: Date): string {
  // Monday-anchored ISO week for grouping.
  const day = startOfUtcDay(d);
  const dow = (day.getUTCDay() + 6) % 7; // Mon=0…Sun=6
  const monday = new Date(day.getTime() - dow * 24 * 60 * 60 * 1000);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type RetentionDecision = {
  keep: BackupFile[];
  prune: BackupFile[];
};

/**
 * Pure retention math: keep the most-recent 7 daily, 4 weekly, 12 monthly. Tiers
 * are union'd (a file kept by daily also covers weekly/monthly slot for that day).
 */
export function pruneRetention(
  files: BackupFile[],
  now: Date = new Date(),
): RetentionDecision {
  const sorted = [...files].sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
  const keep = new Set<string>();

  // Daily: most recent per UTC day, up to 7 days.
  const seenDays = new Set<string>();
  for (const f of sorted) {
    if (seenDays.size >= 7) break;
    const key = startOfUtcDay(f.takenAt).toISOString().slice(0, 10);
    if (seenDays.has(key)) continue;
    seenDays.add(key);
    keep.add(f.fullPath);
  }
  // Weekly: most recent per ISO week, up to 4 weeks.
  const seenWeeks = new Set<string>();
  for (const f of sorted) {
    if (seenWeeks.size >= 4) break;
    const key = isoWeekKey(f.takenAt);
    if (seenWeeks.has(key)) continue;
    seenWeeks.add(key);
    keep.add(f.fullPath);
  }
  // Monthly: most recent per UTC month, up to 12 months.
  const seenMonths = new Set<string>();
  for (const f of sorted) {
    if (seenMonths.size >= 12) break;
    const key = monthKey(f.takenAt);
    if (seenMonths.has(key)) continue;
    seenMonths.add(key);
    keep.add(f.fullPath);
  }

  void now; // reserved for future "keep within window" overrides
  const keptList: BackupFile[] = [];
  const pruneList: BackupFile[] = [];
  for (const f of sorted) {
    if (keep.has(f.fullPath)) keptList.push(f);
    else pruneList.push(f);
  }
  return { keep: keptList, prune: pruneList };
}

export async function applyRetention(
  dir: string,
  now: Date = new Date(),
): Promise<{ kept: number; pruned: number }> {
  const files = await listBackups(dir);
  const decision = pruneRetention(files, now);
  for (const f of decision.prune) {
    await unlink(f.fullPath).catch(() => undefined);
  }
  return { kept: decision.keep.length, pruned: decision.prune.length };
}

// ---------- Weekly email ----------

export const WEEKLY_EMAIL_MAX_BYTES = 25 * 1024 * 1024;

export type WeeklyEmailResult =
  | { ok: true; mode: "attachment"; bytes: number; messageId: string }
  | { ok: true; mode: "warning"; bytes: number; messageId: string }
  | { ok: true; mode: "skipped"; reason: "NO_BACKUP" | "SMTP_OFF" }
  | { ok: false; error: string };

export type WeeklyEmailDeps = {
  listBackups: (dir: string) => Promise<BackupFile[]>;
  smtpConfigured: () => Promise<boolean>;
  sendMail: (input: {
    to: string;
    subject: string;
    text: string;
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
  }) => Promise<{ ok: true; messageId: string } | { ok: false; error: string }>;
  readFile: (p: string) => Promise<Buffer>;
};

/**
 * Sends the most recent backup tarball to `recipient` if under the SMTP cap,
 * otherwise sends a warning email pointing the admin to the offsite copy.
 */
export async function runWeeklyEmail(
  recipient: string,
  backupsDir: string,
  deps: WeeklyEmailDeps,
): Promise<WeeklyEmailResult> {
  if (!(await deps.smtpConfigured())) {
    return { ok: true, mode: "skipped", reason: "SMTP_OFF" };
  }
  const backups = await deps.listBackups(backupsDir);
  if (backups.length === 0) {
    return { ok: true, mode: "skipped", reason: "NO_BACKUP" };
  }
  const latest = backups[0]!;
  if (latest.size > WEEKLY_EMAIL_MAX_BYTES) {
    const r = await deps.sendMail({
      to: recipient,
      subject: "QualityMate weekly backup — too large to email",
      text:
        `The most recent backup (${latest.name}) is ${(latest.size / 1024 / 1024).toFixed(1)} MB ` +
        `which exceeds the 25 MB SMTP attachment cap. Use the offsite (S3) copy or download from ` +
        `the admin Backups page.`,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, mode: "warning", bytes: latest.size, messageId: r.messageId };
  }
  const buf = await deps.readFile(latest.fullPath);
  const r = await deps.sendMail({
    to: recipient,
    subject: "QualityMate weekly backup",
    text: `Attached: ${latest.name} (${(latest.size / 1024 / 1024).toFixed(1)} MB).`,
    attachments: [
      { filename: latest.name, content: buf, contentType: "application/gzip" },
    ],
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, mode: "attachment", bytes: latest.size, messageId: r.messageId };
}

// ---------- Default backups dir ----------

export function defaultBackupsDir(): string {
  return process.env.BACKUPS_DIR ?? "/app/data/backups";
}

export function defaultMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? join(process.cwd(), "drizzle");
}

// Re-export to allow CLIs to discover the path.
export const _internal = { join, relative };
