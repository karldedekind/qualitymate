import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import unzipper from "unzipper";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

function newId(): string {
  return randomBytes(12).toString("base64url");
}

async function createUser(email: string, role: "admin" | "site_staff" = "admin") {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

let uploadsDir: string;

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  uploadsDir = join(tmpdir(), `qm-export-test-${randomBytes(6).toString("hex")}`);
  process.env.UPLOADS_DIR = uploadsDir;
  await mkdir(uploadsDir, { recursive: true });
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
  await rm(uploadsDir, { recursive: true, force: true });
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
  const { _resetForTests } = await import("@/lib/rate-limit");
  _resetForTests();
});

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) {
    chunks.push(typeof c === "string" ? Buffer.from(c) : (c as Buffer));
  }
  return Buffer.concat(chunks);
}

async function readZipEntries(zip: Buffer): Promise<Map<string, Buffer>> {
  const directory = await unzipper.Open.buffer(zip);
  const out = new Map<string, Buffer>();
  for (const file of directory.files) {
    if (file.type !== "File") continue;
    const data = await file.buffer();
    out.set(file.path, data);
  }
  return out;
}

describe("buildExportStream — file tree + content", () => {
  it("ZIP contains README, manifest, csv/, settings.json, uploads/", async () => {
    const u = await createUser("admin@example.com");
    const { set } = await import("@/lib/settings");
    await set("smtp.password", "supersecret");
    await set("ai.anthropic_key", "sk-test-secret");
    await set("branding.company_name", "Acme Co");

    // Drop a fake upload so the uploads/ tree appears in the ZIP.
    const photoDir = join(uploadsDir, "branding");
    await mkdir(photoDir, { recursive: true });
    await writeFile(join(photoDir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { db } = await import("@/db");
    const { jobs } = await import("@/db/schema");
    await db.insert(jobs).values({ id: newId(), number: "J-001", name: "Site A", createdBy: u.id });

    const { buildExportStream } = await import("@/lib/data-export");
    const { stream, manifest } = await buildExportStream();
    const zip = await streamToBuffer(stream);
    const entries = await readZipEntries(zip);

    expect(entries.has("README.txt")).toBe(true);
    expect(entries.has("manifest.json")).toBe(true);
    expect(entries.has("settings.json")).toBe(true);
    expect(entries.has("csv/user.csv")).toBe(true);
    expect(entries.has("csv/jobs.csv")).toBe(true);
    expect(entries.has("csv/audit_log.csv")).toBe(true);
    expect(entries.has("uploads/branding/logo.png")).toBe(true);

    expect(manifest.uploadFiles).toBe(1);
    expect(manifest.rowCounts.jobs).toBe(1);
    expect(manifest.rowCounts.user).toBeGreaterThanOrEqual(1);
  });

  it("settings.json redacts secret values; preserves non-secret values", async () => {
    await createUser("admin@example.com");
    const { set } = await import("@/lib/settings");
    await set("smtp.password", "hunter2");
    await set("ai.anthropic_key", "sk-leaked");
    await set("s3.secret_access_key", "AKIA-leaked");
    await set("heartbeat.token", "tok-leaked");
    await set("branding.company_name", "Acme Co");
    await set("branding.primary_color", "#112233");

    const { buildExportStream } = await import("@/lib/data-export");
    const { stream } = await buildExportStream();
    const zip = await streamToBuffer(stream);
    const entries = await readZipEntries(zip);
    const settingsJson = JSON.parse(entries.get("settings.json")!.toString("utf-8")) as {
      key: string;
      value: string | null;
      isSecret: boolean;
    }[];
    const map = Object.fromEntries(settingsJson.map((s) => [s.key, s]));

    for (const k of [
      "smtp.password",
      "ai.anthropic_key",
      "s3.secret_access_key",
      "heartbeat.token",
    ]) {
      expect(map[k]).toBeDefined();
      expect(map[k]!.value).toBe("[REDACTED]");
      expect(map[k]!.isSecret).toBe(true);
      expect(JSON.stringify(settingsJson)).not.toContain("hunter2");
    }
    expect(map["branding.company_name"]!.value).toBe("Acme Co");
    expect(map["branding.primary_color"]!.value).toBe("#112233");
  });

  it("CSV is RFC 4180 compatible with CRLF and quoting", async () => {
    const u = await createUser("admin@example.com");
    const { db } = await import("@/db");
    const { jobs } = await import("@/db/schema");
    // Insert tricky values: comma, quote, newline.
    await db.insert(jobs).values({
      id: newId(),
      number: "J,001",
      name: 'Site "Alpha"\nLine 2',
      createdBy: u.id,
    });

    const { buildExportStream } = await import("@/lib/data-export");
    const { stream } = await buildExportStream();
    const zip = await streamToBuffer(stream);
    const entries = await readZipEntries(zip);
    const csv = entries.get("csv/jobs.csv")!.toString("utf-8");
    expect(csv.endsWith("\r\n")).toBe(true);
    // Header line ends with CRLF
    expect(csv.split("\r\n")[0]).toContain("number");
    // Embedded quote doubled, value wrapped in quotes
    expect(csv).toContain('"J,001"');
    expect(csv).toContain('"Site ""Alpha""');
  });

  it("approved meeting PDFs included; non-approved meetings skipped", async () => {
    const admin = await createUser("admin@example.com");
    const { schedule, manualMinutes, issueSignoffTokens, recordSignoff, approve } =
      await import("@/lib/meetings");
    const { set, KNOWN_KEYS } = await import("@/lib/settings");
    await set(KNOWN_KEYS.ISO_MANAGEMENT_REP, admin.id);

    const m1 = await schedule({
      title: "Approved meeting",
      scheduledAt: new Date("2026-06-01T10:00:00Z"),
      attendees: [{ userId: null, name: "Alice", email: "alice@example.com" }],
      createdBy: admin.id,
    });
    await manualMinutes(m1.id, {
      attendees: ["Alice"],
      apologies: [],
      decisions: ["X"],
      followUps: [],
      notes: "n",
    });
    const issued = await issueSignoffTokens(m1.id);
    if (!issued.ok) throw new Error();
    for (const i of issued.issued) await recordSignoff(m1.id, i.token, "1.1.1.1");
    const r = await approve(m1.id, admin.id);
    expect(r.ok).toBe(true);

    // Second meeting, not approved
    await schedule({
      title: "Pending",
      scheduledAt: new Date("2026-07-01T10:00:00Z"),
      attendees: [],
      createdBy: admin.id,
    });

    const { buildExportStream } = await import("@/lib/data-export");
    const { stream, manifest } = await buildExportStream();
    const zip = await streamToBuffer(stream);
    const entries = await readZipEntries(zip);
    const pdfPaths = [...entries.keys()].filter((p) => p.startsWith("meeting-pdfs/"));
    expect(pdfPaths).toHaveLength(1);
    expect(pdfPaths[0]).toBe(`meeting-pdfs/minutes-${m1.id}.pdf`);
    expect(manifest.meetingPdfs).toBe(1);
    // PDF magic header
    const pdfBytes = entries.get(pdfPaths[0]!)!;
    expect(pdfBytes.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});

describe("rate-limit — one export per admin per 5 minutes", () => {
  it("first call ok, second within 5min returns retry signal", async () => {
    const { consume, _resetForTests } = await import("@/lib/rate-limit");
    _resetForTests();
    const key = "data-export:admin-1";
    const a = consume(key, { limit: 1, windowMs: 5 * 60 * 1000 });
    expect(a.ok).toBe(true);
    const b = consume(key, { limit: 1, windowMs: 5 * 60 * 1000 });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.retryAfterMs).toBeGreaterThan(0);
      expect(b.retryAfterMs).toBeLessThanOrEqual(5 * 60 * 1000);
    }
  });

  it("after the window expires, a new call is allowed", async () => {
    const { consume, _resetForTests } = await import("@/lib/rate-limit");
    _resetForTests();
    const key = "data-export:admin-2";
    const t0 = Date.now();
    const a = consume(key, { limit: 1, windowMs: 5 * 60 * 1000, now: t0 });
    expect(a.ok).toBe(true);
    const b = consume(key, { limit: 1, windowMs: 5 * 60 * 1000, now: t0 + 6 * 60 * 1000 });
    expect(b.ok).toBe(true);
  });
});
