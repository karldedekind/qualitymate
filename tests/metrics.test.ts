import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

function newId(): string {
  return randomBytes(12).toString("base64url");
}

async function createUser(email: string, role: "admin" | "site_staff" = "site_staff") {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

async function insertJob(number: string, name: string) {
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const [row] = await db
    .insert(jobs)
    .values({ id: newId(), number, name })
    .returning();
  return row;
}

async function insertCategory(code: string, kind: string, label: string) {
  const { db } = await import("@/db");
  const { categories } = await import("@/db/schema");
  const [row] = await db
    .insert(categories)
    .values({ id: newId(), code, kind, label })
    .returning();
  return row;
}

async function insertIncident(opts: {
  filedBy: string;
  jobId?: string | null;
  categoryId?: string | null;
  title: string;
  status?: "pending_review" | "open" | "closed";
  createdAt?: Date;
  closedAt?: Date | null;
}) {
  const { db } = await import("@/db");
  const { incidents } = await import("@/db/schema");
  const [row] = await db
    .insert(incidents)
    .values({
      id: newId(),
      filedBy: opts.filedBy,
      jobId: opts.jobId ?? null,
      categoryId: opts.categoryId ?? null,
      title: opts.title,
      description: "x",
      status: opts.status ?? "pending_review",
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
      closedAt: opts.closedAt ?? null,
    })
    .returning();
  return row;
}

async function insertAction(opts: {
  title: string;
  assigneeId?: string | null;
  deadline: Date;
  status?: "open" | "resolved";
  createdAt?: Date;
}) {
  const { db } = await import("@/db");
  const { correctiveActions } = await import("@/db/schema");
  const [row] = await db
    .insert(correctiveActions)
    .values({
      id: newId(),
      title: opts.title,
      assigneeId: opts.assigneeId ?? null,
      deadline: opts.deadline,
      status: opts.status ?? "open",
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    })
    .returning();
  return row;
}

async function insertMeeting(scheduledAt: Date, status: "scheduled" | "completed" | "approved") {
  const { db } = await import("@/db");
  const { meetings } = await import("@/db/schema");
  const [row] = await db
    .insert(meetings)
    .values({
      id: newId(),
      title: "M",
      scheduledAt,
      status,
    })
    .returning();
  return row;
}

const NOW = new Date("2026-05-06T12:00:00Z");
const D = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

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
  await db.execute(sql`TRUNCATE "register_entries" CASCADE`);
  await db.execute(sql`TRUNCATE "corrective_actions" CASCADE`);
  await db.execute(sql`TRUNCATE "incident_photos" CASCADE`);
  await db.execute(sql`TRUNCATE "incidents" CASCADE`);
  await db.execute(sql`TRUNCATE "categories" CASCADE`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "meetings" CASCADE`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

async function seedFixture() {
  const u = await createUser("u@example.com");
  const jobA = await insertJob("J-001", "Site Alpha");
  const jobB = await insertJob("J-002", "Site Bravo");
  const jobC = await insertJob("J-003", "Site Charlie");
  const catSafety = await insertCategory("safety", "incident", "Safety");
  const catQuality = await insertCategory("quality", "incident", "Quality");

  // Incidents — categories + status + jobs + dates within 90d window
  await insertIncident({
    filedBy: u.id,
    jobId: jobA.id,
    categoryId: catSafety.id,
    title: "I1",
    status: "open",
    createdAt: D(5),
  });
  await insertIncident({
    filedBy: u.id,
    jobId: jobA.id,
    categoryId: catSafety.id,
    title: "I2",
    status: "pending_review",
    createdAt: D(10),
  });
  await insertIncident({
    filedBy: u.id,
    jobId: jobA.id,
    categoryId: catQuality.id,
    title: "I3",
    status: "closed",
    createdAt: D(40),
    closedAt: D(30), // 10-day TTC
  });
  await insertIncident({
    filedBy: u.id,
    jobId: jobB.id,
    categoryId: catQuality.id,
    title: "I4",
    status: "closed",
    createdAt: D(60),
    closedAt: D(40), // 20-day TTC
  });
  await insertIncident({
    filedBy: u.id,
    jobId: jobB.id,
    categoryId: null,
    title: "I5",
    status: "open",
    createdAt: D(15),
  });
  // Out-of-window incident (>90d) — affects trend but not 90d aggregations
  await insertIncident({
    filedBy: u.id,
    jobId: jobC.id,
    categoryId: catSafety.id,
    title: "I6",
    status: "closed",
    createdAt: D(200),
    closedAt: D(190),
  });

  // Actions: 1 overdue open, 1 future open, 2 resolved
  await insertAction({
    title: "A-overdue",
    assigneeId: u.id,
    deadline: D(2), // past
    status: "open",
    createdAt: D(20),
  });
  await insertAction({
    title: "A-future",
    assigneeId: u.id,
    deadline: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    status: "open",
    createdAt: D(20),
  });
  await insertAction({
    title: "A-done-1",
    assigneeId: u.id,
    deadline: D(5),
    status: "resolved",
    createdAt: D(20),
  });
  await insertAction({
    title: "A-done-2",
    assigneeId: u.id,
    deadline: D(5),
    status: "resolved",
    createdAt: D(20),
  });

  // Meetings: one in past, one upcoming scheduled, one upcoming approved
  await insertMeeting(D(30), "completed");
  await insertMeeting(new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000), "scheduled");
  await insertMeeting(new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000), "scheduled");

  return { user: u, jobA, jobB, jobC, catSafety, catQuality };
}

describe("metrics — aggregations against fixture", () => {
  it("kpis() returns expected numbers", async () => {
    await seedFixture();
    const { kpis } = await import("@/lib/metrics");
    const k = await kpis(NOW);
    // Open incidents = non-closed = I1, I2, I5 = 3
    expect(k.openIncidents).toBe(3);
    // Actions overdue = open AND deadline < now = 1
    expect(k.actionsOverdue).toBe(1);
    // Avg days to close: I3 = 10, I4 = 20, I6 = 10 → mean = 13.3
    expect(k.avgDaysToClose).toBeCloseTo(13.3, 1);
    // Next upcoming meeting status = scheduled
    expect(k.nextQuarterlyMeetingStatus).toBe("scheduled");
  });

  it("kpis() with empty DB returns zeros and null avg", async () => {
    const { kpis } = await import("@/lib/metrics");
    const k = await kpis(NOW);
    expect(k.openIncidents).toBe(0);
    expect(k.actionsOverdue).toBe(0);
    expect(k.avgDaysToClose).toBeNull();
    expect(k.nextQuarterlyMeetingStatus).toBe("none");
  });

  it("incidentTrend(12) returns 12 contiguous months ending at now", async () => {
    await seedFixture();
    const { incidentTrend } = await import("@/lib/metrics");
    const trend = await incidentTrend(12, NOW);
    expect(trend).toHaveLength(12);
    // last entry is the current month (UTC)
    const last = trend[trend.length - 1]!;
    expect(last.month).toBe("2026-05");
    // 5 incidents within last 90 days, all in current/recent months
    const total = trend.reduce((s, p) => s + p.count, 0);
    // I6 is 200 days back — 200d before 2026-05-06 = 2025-10-18, falls within 12 months
    expect(total).toBe(6);
  });

  it("categoryBreakdown(90) groups by label, ordered desc, splits Uncategorised", async () => {
    await seedFixture();
    const { categoryBreakdown } = await import("@/lib/metrics");
    const out = await categoryBreakdown(90, NOW);
    // I1, I2 safety; I3, I4 quality; I5 uncategorised (5 in window)
    const map = Object.fromEntries(out.map((c) => [c.label, c.count]));
    expect(map["Safety"]).toBe(2);
    expect(map["Quality"]).toBe(2);
    expect(map["Uncategorised"]).toBe(1);
    // ordered descending
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.count >= out[i]!.count).toBe(true);
    }
  });

  it("actionsByStatus returns both buckets, zeros where missing", async () => {
    await seedFixture();
    const { actionsByStatus } = await import("@/lib/metrics");
    const out = await actionsByStatus();
    expect(out.find((b) => b.status === "open")?.count).toBe(2);
    expect(out.find((b) => b.status === "resolved")?.count).toBe(2);
  });

  it("topJobsByIncidentCount(5, 90) ranks by incident count, excludes out-of-window", async () => {
    const seeded = await seedFixture();
    const { topJobsByIncidentCount } = await import("@/lib/metrics");
    const out = await topJobsByIncidentCount(5, 90, NOW);
    // jobA = 3 (I1, I2, I3), jobB = 2 (I4, I5), jobC excluded (out of window)
    expect(out.map((j) => j.number)).toEqual(["J-001", "J-002"]);
    expect(out[0]!.count).toBe(3);
    expect(out[1]!.count).toBe(2);
    expect(out[0]!.jobId).toBe(seeded.jobA.id);
  });

  it("myRecentIncidents returns last 5 by createdAt desc for the user only", async () => {
    const seeded = await seedFixture();
    const other = await createUser("other@example.com");
    await insertIncident({
      filedBy: other.id,
      jobId: seeded.jobA.id,
      title: "OTHER",
      status: "open",
      createdAt: D(1),
    });
    const { myRecentIncidents } = await import("@/lib/metrics");
    const mine = await myRecentIncidents(seeded.user.id, 5);
    expect(mine).toHaveLength(5);
    expect(mine.every((r) => r.title !== "OTHER")).toBe(true);
    // sorted desc — most recent first (I1 at D(5))
    expect(mine[0]!.title).toBe("I1");
  });

  it("myOpenActions flags overdue rows and excludes resolved", async () => {
    const seeded = await seedFixture();
    const { myOpenActions } = await import("@/lib/metrics");
    const out = await myOpenActions(seeded.user.id, NOW);
    expect(out.map((a) => a.title).sort()).toEqual(["A-future", "A-overdue"]);
    const overdue = out.find((a) => a.title === "A-overdue")!;
    const future = out.find((a) => a.title === "A-future")!;
    expect(overdue.overdue).toBe(true);
    expect(future.overdue).toBe(false);
  });
});
