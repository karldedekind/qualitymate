import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

function newId(): string {
  return randomBytes(12).toString("base64url");
}

let workDir: string;
let backupsDir: string;
let uploadsDir: string;

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  workDir = join(tmpdir(), `qm-backup-${randomBytes(6).toString("hex")}`);
  backupsDir = join(workDir, "backups");
  uploadsDir = join(workDir, "uploads");
  await mkdir(backupsDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.BACKUPS_DIR = backupsDir;
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
  await rm(workDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "register_entries" CASCADE`);
  await db.execute(sql`TRUNCATE "incident_photos" CASCADE`);
  await db.execute(sql`TRUNCATE "incidents" CASCADE`);
  await db.execute(sql`TRUNCATE "corrective_actions" CASCADE`);
  await db.execute(sql`TRUNCATE "categories" CASCADE`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "meetings" CASCADE`);
  await db.execute(sql`TRUNCATE "settings"`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

async function createUser(email: string) {
  const { auth } = await import("@/lib/auth");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

describe("backup tarball — round trip", () => {
  it("createTarball → restoreTarball preserves rows + uploads byte-for-byte", async () => {
    const u = await createUser("admin@example.com");

    const { db } = await import("@/db");
    const { jobs, incidents } = await import("@/db/schema");

    // Seed
    const job = (await db
      .insert(jobs)
      .values({ id: newId(), number: "J,001", name: 'Site "Alpha"\nLine2', createdBy: u.id })
      .returning())[0]!;
    const inc = (await db
      .insert(incidents)
      .values({
        id: newId(),
        jobId: job.id,
        filedBy: u.id,
        title: "Strange title with, comma\nand newline",
        description: "desc",
        status: "open",
      })
      .returning())[0]!;

    const photoBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const photoDir = join(uploadsDir, "incidents", inc.id);
    await mkdir(photoDir, { recursive: true });
    await writeFile(join(photoDir, "photo.png"), photoBytes);

    const { createTarball, restoreTarball, defaultMigrationsDir } = await import(
      "@/lib/backup"
    );
    const outFile = join(backupsDir, "qualitymate-backup-2026-05-06T02-00-00Z.tar.gz");
    const create = await createTarball({
      databaseUrl: process.env.DATABASE_URL!,
      uploadsDir,
      migrationsDir: defaultMigrationsDir(),
      outFile,
    });
    expect(create.bytes).toBeGreaterThan(0);
    expect(create.manifest.uploadsFiles).toBe(1);

    // Wipe DB + uploads to simulate disaster.
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE "incident_photos" CASCADE`);
    await db.execute(sql`TRUNCATE "incidents" CASCADE`);
    await db.execute(sql`TRUNCATE "jobs" CASCADE`);
    await db.execute(sql`TRUNCATE "user" CASCADE`);
    await rm(uploadsDir, { recursive: true, force: true });
    await mkdir(uploadsDir, { recursive: true });

    // Restore
    const restored = await restoreTarball({
      databaseUrl: process.env.DATABASE_URL!,
      uploadsDir,
      migrationsDir: defaultMigrationsDir(),
      tarFile: outFile,
    });
    expect(restored.uploadsRestored).toBe(1);
    expect(restored.rowsRestored.user).toBeGreaterThanOrEqual(1);
    expect(restored.rowsRestored.jobs).toBe(1);
    expect(restored.rowsRestored.incidents).toBe(1);

    // Row equality
    const { eq } = await import("drizzle-orm");
    const jobRow = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(jobRow[0]!.number).toBe("J,001");
    expect(jobRow[0]!.name).toBe('Site "Alpha"\nLine2');
    const incRow = await db.select().from(incidents).where(eq(incidents.id, inc.id));
    expect(incRow[0]!.title).toBe("Strange title with, comma\nand newline");

    // Upload byte-equality
    const restoredPhoto = await readFile(join(uploadsDir, "incidents", inc.id, "photo.png"));
    expect(Buffer.compare(restoredPhoto, photoBytes)).toBe(0);
  });
});

describe("runWeeklyEmail — 25 MB cap behaviour", () => {
  it("attaches the latest backup when under the cap", async () => {
    const { runWeeklyEmail } = await import("@/lib/backup");
    const sentMails: { subject: string; bytes: number; hasAttachment: boolean }[] = [];
    const r = await runWeeklyEmail("admin@example.com", "/ignored", {
      smtpConfigured: async () => true,
      listBackups: async () => [
        {
          name: "qualitymate-backup-2026-05-06T02-00-00Z.tar.gz",
          fullPath: "/ignored/x.tar.gz",
          size: 5 * 1024 * 1024,
          mtime: new Date(),
          takenAt: new Date(),
        },
      ],
      sendMail: async (input) => {
        sentMails.push({
          subject: input.subject,
          bytes: input.attachments?.[0]?.content.length ?? 0,
          hasAttachment: (input.attachments?.length ?? 0) > 0,
        });
        return { ok: true, messageId: "msg-1" };
      },
      readFile: async () => Buffer.alloc(5 * 1024 * 1024),
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "attachment") {
      expect(r.bytes).toBe(5 * 1024 * 1024);
    } else {
      throw new Error(`unexpected mode: ${JSON.stringify(r)}`);
    }
    expect(sentMails[0]!.hasAttachment).toBe(true);
    expect(sentMails[0]!.subject).toContain("weekly backup");
  });

  it("sends a warning email (no attachment) when the latest backup is over 25 MB", async () => {
    const { runWeeklyEmail } = await import("@/lib/backup");
    const sentMails: { subject: string; hasAttachment: boolean }[] = [];
    const r = await runWeeklyEmail("admin@example.com", "/ignored", {
      smtpConfigured: async () => true,
      listBackups: async () => [
        {
          name: "qualitymate-backup-2026-05-06T02-00-00Z.tar.gz",
          fullPath: "/ignored/x.tar.gz",
          size: 30 * 1024 * 1024,
          mtime: new Date(),
          takenAt: new Date(),
        },
      ],
      sendMail: async (input) => {
        sentMails.push({
          subject: input.subject,
          hasAttachment: (input.attachments?.length ?? 0) > 0,
        });
        return { ok: true, messageId: "msg-2" };
      },
      readFile: async () => Buffer.alloc(0),
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "warning") {
      expect(r.bytes).toBe(30 * 1024 * 1024);
    } else {
      throw new Error(`unexpected mode: ${JSON.stringify(r)}`);
    }
    expect(sentMails[0]!.hasAttachment).toBe(false);
    expect(sentMails[0]!.subject).toContain("too large");
  });
});
