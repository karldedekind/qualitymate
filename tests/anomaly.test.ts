import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createJob(number: string, name = "Test job") {
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { randomBytes } = await import("node:crypto");
  const id = randomBytes(8).toString("base64url");
  await db.insert(jobs).values({ id, number, name, active: true });
  return id;
}

async function createAdmin(email: string) {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role: "admin", emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

async function insertSignIn(jobId: string, company: string, signedInAt: Date) {
  const { db } = await import("@/db");
  const { siteAttendances } = await import("@/db/schema");
  const { randomBytes } = await import("node:crypto");
  const id = randomBytes(8).toString("base64url");
  const departure = new Date(signedInAt.getTime() + 8 * 60 * 60 * 1000);
  await db.insert(siteAttendances).values({
    id,
    jobId,
    fullName: "Worker",
    mobile: "0400000000",
    companyName: company,
    trade: "Carpenter",
    emergencyContactName: "EC",
    emergencyContactPhone: "0400000001",
    whiteCardNumber: "WC-1",
    whiteCardExpiry: "2099-01-01",
    declWhsmp: true,
    declEmergency: true,
    declFitForWork: true,
    declEmergencyAction: true,
    declHazards: true,
    declPpe: true,
    declCompetent: true,
    declSiteRules: true,
    consent: true,
    signaturePath: "x/y.png",
    signedInAt,
    plannedDepartureAt: departure,
  });
}

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "site_attendances" CASCADE`);
  await db.execute(sql`TRUNCATE "notifications" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

describe("scanUnknownsForJob — known/unknown classification", () => {
  it("companies seen in prior 30 days are known; new companies are unknown", async () => {
    const { scanUnknownsForJob } = await import("@/lib/anomaly");
    const jobId = await createJob("J-001");
    const day = "2026-05-06";
    const dayStart = new Date(`${day}T08:00:00Z`);

    await insertSignIn(jobId, "Acme", new Date("2026-04-20T08:00:00Z"));
    await insertSignIn(jobId, "BuildSafe", new Date("2026-04-25T08:00:00Z"));

    await insertSignIn(jobId, "Acme", dayStart);
    await insertSignIn(jobId, "BuildSafe", dayStart);
    await insertSignIn(jobId, "Newco-1", dayStart);
    await insertSignIn(jobId, "Newco-2", dayStart);

    const result = await scanUnknownsForJob(jobId, day);
    expect(result?.totalSignIns).toBe(4);
    expect(result?.unknownCompanies.sort()).toEqual(["Newco-1", "Newco-2"]);
    expect(result?.triggered).toBe(false);
  });

  it("normalises company name (trim + lower) when comparing prior vs day", async () => {
    const { scanUnknownsForJob } = await import("@/lib/anomaly");
    const jobId = await createJob("J-002");
    const day = "2026-05-06";
    await insertSignIn(jobId, "Acme Pty", new Date("2026-04-20T08:00:00Z"));
    await insertSignIn(jobId, "  ACME PTY  ", new Date(`${day}T09:00:00Z`));

    const result = await scanUnknownsForJob(jobId, day);
    expect(result?.unknownCount).toBe(0);
  });
});

describe("scanUnknownsForJob — threshold", () => {
  it("does not trigger at exactly 5 unknown companies", async () => {
    const { scanUnknownsForJob } = await import("@/lib/anomaly");
    const jobId = await createJob("T-005");
    const day = "2026-05-06";
    const t = new Date(`${day}T08:00:00Z`);
    for (let i = 1; i <= 5; i++) await insertSignIn(jobId, `Newco-${i}`, t);
    const result = await scanUnknownsForJob(jobId, day);
    expect(result?.unknownCount).toBe(5);
    expect(result?.triggered).toBe(false);
  });

  it("triggers at 6 unknown companies", async () => {
    const { scanUnknownsForJob } = await import("@/lib/anomaly");
    const jobId = await createJob("T-006");
    const day = "2026-05-06";
    const t = new Date(`${day}T08:00:00Z`);
    for (let i = 1; i <= 6; i++) await insertSignIn(jobId, `Newco-${i}`, t);
    const result = await scanUnknownsForJob(jobId, day);
    expect(result?.unknownCount).toBe(6);
    expect(result?.triggered).toBe(true);
  });
});

describe("scanAllJobs — notification fan-out", () => {
  it("fires a notification to each admin only when threshold breached", async () => {
    const { scanAllJobs } = await import("@/lib/anomaly");
    const { unreadCount } = await import("@/lib/notify");

    const admin1 = await createAdmin("admin1@example.com");
    const admin2 = await createAdmin("admin2@example.com");

    const noisyJob = await createJob("N-001");
    const calmJob = await createJob("N-002");
    const day = "2026-05-06";
    const t = new Date(`${day}T08:00:00Z`);

    for (let i = 1; i <= 6; i++) await insertSignIn(noisyJob, `New-${i}`, t);
    for (let i = 1; i <= 5; i++) await insertSignIn(calmJob, `OtherNew-${i}`, t);

    const result = await scanAllJobs(day);
    expect(result.scanned).toBe(2);
    expect(result.triggered.map((r) => r.jobNumber)).toEqual(["N-001"]);
    expect(result.notifiedAdmins).toBe(2);

    expect(await unreadCount(admin1.id)).toBe(1);
    expect(await unreadCount(admin2.id)).toBe(1);
  });
});
