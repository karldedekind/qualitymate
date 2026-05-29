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

async function insertAttendance(opts: {
  jobId: string;
  fullName: string;
  company?: string;
  trade?: string;
  signedInAt: Date;
  plannedDepartureAt: Date;
  whiteCardExpiry?: string;
}) {
  const { db } = await import("@/db");
  const { siteAttendances } = await import("@/db/schema");
  const { randomBytes } = await import("node:crypto");
  const id = randomBytes(8).toString("base64url");
  await db.insert(siteAttendances).values({
    id,
    jobId: opts.jobId,
    fullName: opts.fullName,
    mobile: "0400000000",
    companyName: opts.company ?? "Acme",
    trade: opts.trade ?? "Carpenter",
    emergencyContactName: "EC",
    emergencyContactPhone: "0400000001",
    whiteCardNumber: "WC-1",
    whiteCardExpiry: opts.whiteCardExpiry ?? "2099-01-01",
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
    signedInAt: opts.signedInAt,
    plannedDepartureAt: opts.plannedDepartureAt,
  });
  return id;
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
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

describe("listForJob — date scoping", () => {
  it("returns only attendances on the requested UTC day for the requested job", async () => {
    const { listForJob } = await import("@/lib/roster");
    const a = await createJob("A-001");
    const b = await createJob("B-001");
    const day = "2026-05-06";

    await insertAttendance({
      jobId: a,
      fullName: "In day",
      signedInAt: new Date(`${day}T08:30:00Z`),
      plannedDepartureAt: new Date(`${day}T15:00:00Z`),
    });
    await insertAttendance({
      jobId: a,
      fullName: "Just before",
      signedInAt: new Date("2026-05-05T23:59:59Z"),
      plannedDepartureAt: new Date("2026-05-06T01:00:00Z"),
    });
    await insertAttendance({
      jobId: a,
      fullName: "Next day",
      signedInAt: new Date("2026-05-07T00:00:00Z"),
      plannedDepartureAt: new Date("2026-05-07T08:00:00Z"),
    });
    await insertAttendance({
      jobId: b,
      fullName: "Other job",
      signedInAt: new Date(`${day}T08:30:00Z`),
      plannedDepartureAt: new Date(`${day}T15:00:00Z`),
    });

    const rows = await listForJob(a, day);
    expect(rows.map((r) => r.fullName)).toEqual(["In day"]);
  });
});

describe("filterRows — trade + company", () => {
  it("trade filter matches exact case-insensitive; company filter is case-insensitive substring", async () => {
    const { filterRows } = await import("@/lib/roster");
    const baseTime = new Date("2026-05-06T08:00:00Z");
    const jobId = await createJob("F-001");
    await insertAttendance({ jobId, fullName: "A", company: "BuildSafe Pty", trade: "Electrician", signedInAt: baseTime, plannedDepartureAt: baseTime });
    await insertAttendance({ jobId, fullName: "B", company: "Acme", trade: "Carpenter", signedInAt: baseTime, plannedDepartureAt: baseTime });
    await insertAttendance({ jobId, fullName: "C", company: "BuildSafe Holdings", trade: "Electrician", signedInAt: baseTime, plannedDepartureAt: baseTime });

    const { listForJob } = await import("@/lib/roster");
    const all = await listForJob(jobId, "2026-05-06");

    const electricians = filterRows(all, { trade: "electrician" });
    expect(electricians.map((r) => r.fullName).sort()).toEqual(["A", "C"]);

    const buildsafe = filterRows(all, { company: "buildsafe" });
    expect(buildsafe.map((r) => r.fullName).sort()).toEqual(["A", "C"]);

    const both = filterRows(all, { trade: "Carpenter", company: "Acme" });
    expect(both.map((r) => r.fullName)).toEqual(["B"]);

    const none = filterRows(all, { trade: null, company: "" });
    expect(none).toHaveLength(3);
  });
});

describe("isCurrentlyOnSite / countCurrentlyOnSite — boundaries", () => {
  it("inclusive at signed-in and planned-departure boundaries; exclusive just outside", async () => {
    const { isCurrentlyOnSite, countCurrentlyOnSite } = await import("@/lib/roster");
    const signedIn = new Date("2026-05-06T08:00:00Z");
    const departure = new Date("2026-05-06T16:00:00Z");
    const row = {
      signedInAt: signedIn,
      plannedDepartureAt: departure,
    } as Parameters<typeof isCurrentlyOnSite>[0];

    expect(isCurrentlyOnSite(row, new Date("2026-05-06T07:59:59Z"))).toBe(false);
    expect(isCurrentlyOnSite(row, signedIn)).toBe(true);
    expect(isCurrentlyOnSite(row, new Date("2026-05-06T12:00:00Z"))).toBe(true);
    expect(isCurrentlyOnSite(row, departure)).toBe(true);
    expect(isCurrentlyOnSite(row, new Date("2026-05-06T16:00:01Z"))).toBe(false);

    expect(countCurrentlyOnSite([row], signedIn)).toBe(1);
    expect(countCurrentlyOnSite([row], new Date("2026-05-06T16:00:01Z"))).toBe(0);
  });
});

describe("whiteCardStatus", () => {
  it("returns expired / expires_today / valid based on UTC midnight comparison", async () => {
    const { whiteCardStatus } = await import("@/lib/roster");
    const now = new Date("2026-05-06T10:00:00Z");
    expect(whiteCardStatus("2026-05-05", now)).toBe("expired");
    expect(whiteCardStatus("2026-05-06", now)).toBe("expires_today");
    expect(whiteCardStatus("2026-05-07", now)).toBe("valid");
    expect(whiteCardStatus("not-a-date", now)).toBe("expired");
  });
});

describe("supervisor token", () => {
  it("rotateSupervisorToken stores a hash, verify only matches the most-recent token", async () => {
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    await db
      .insert(user)
      .values({ id: "admin-1", email: "admin-1@example.com", name: "Admin One", role: "admin" })
      .onConflictDoNothing();
    const {
      rotateSupervisorToken,
      verifySupervisorToken,
      hasSupervisorToken,
    } = await import("@/lib/roster");
    const jobId = await createJob("T-001");

    expect(await hasSupervisorToken(jobId)).toBe(false);
    expect(await verifySupervisorToken(jobId, "anything")).toBe(false);

    const { token: t1 } = await rotateSupervisorToken(jobId, { id: "admin-1" });
    expect(t1).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(await hasSupervisorToken(jobId)).toBe(true);
    expect(await verifySupervisorToken(jobId, t1)).toBe(true);
    expect(await verifySupervisorToken(jobId, "wrong")).toBe(false);

    const { token: t2 } = await rotateSupervisorToken(jobId, { id: "admin-1" });
    expect(t2).not.toBe(t1);
    expect(await verifySupervisorToken(jobId, t1)).toBe(false);
    expect(await verifySupervisorToken(jobId, t2)).toBe(true);
  });

  it("does not crash when verifying empty token", async () => {
    const { verifySupervisorToken } = await import("@/lib/roster");
    const jobId = await createJob("T-002");
    expect(await verifySupervisorToken(jobId, "")).toBe(false);
  });
});

describe("toCsv", () => {
  it("emits header + escaped rows with white card status", async () => {
    const { toCsv } = await import("@/lib/roster");
    const jobId = await createJob("C-001");
    const day = "2026-05-06";
    await insertAttendance({
      jobId,
      fullName: 'Quote, "Joe"',
      company: "Acme",
      trade: "Carpenter",
      signedInAt: new Date(`${day}T08:00:00Z`),
      plannedDepartureAt: new Date(`${day}T16:00:00Z`),
      whiteCardExpiry: "2099-01-01",
    });
    const { listForJob } = await import("@/lib/roster");
    const rows = await listForJob(jobId, day);
    const csv = toCsv(rows, new Date(`${day}T10:00:00Z`));
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("white_card_status");
    expect(lines[1]).toContain('"Quote, ""Joe"""');
    expect(lines[1]).toContain("valid");
  });
});
