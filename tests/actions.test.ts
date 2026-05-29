import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

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
  await db.execute(sql`TRUNCATE "corrective_actions" CASCADE`);
  await db.execute(sql`TRUNCATE "notifications" CASCADE`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("create / assign / resolve", () => {
  it("creates an action with assignee + deadline; resolves and stamps fields", async () => {
    const { create, resolve, findById } = await import("@/lib/actions");
    const u = await createUser("a@example.com");
    const now = new Date("2026-05-06T00:00:00Z");
    const deadline = new Date(now.getTime() + 7 * DAY);

    const a = await create({
      title: "Fix bracket",
      description: "Replace bracket on bay 3",
      assigneeId: u.id,
      deadline,
      createdBy: u.id,
    });
    expect(a.status).toBe("open");
    expect(a.assigneeId).toBe(u.id);
    expect(a.deadline.getTime()).toBe(deadline.getTime());

    const resolved = await resolve(a.id, u.id, "Replaced and inspected");
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolutionNote).toBe("Replaced and inspected");

    const fetched = await findById(a.id);
    expect(fetched?.resolvedBy).toBe(u.id);
  });

  it("assign() clears prior notification stamps so reassign re-notifies", async () => {
    const { create, assign, findById } = await import("@/lib/actions");
    const { db } = await import("@/db");
    const { correctiveActions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const u1 = await createUser("u1@example.com");
    const u2 = await createUser("u2@example.com");

    const a = await create({
      title: "T",
      assigneeId: u1.id,
      deadline: new Date(Date.now() + DAY),
      createdBy: u1.id,
    });
    await db
      .update(correctiveActions)
      .set({ dueSoonNotifiedAt: new Date(), overdueNotifiedAt: new Date() })
      .where(eq(correctiveActions.id, a.id));

    await assign(a.id, u2.id);
    const after = await findById(a.id);
    expect(after?.assigneeId).toBe(u2.id);
    expect(after?.dueSoonNotifiedAt).toBeNull();
    expect(after?.overdueNotifiedAt).toBeNull();
  });
});

describe("dueSoonScan / overdueScan — boundary conditions", () => {
  it("includes deadlines within 3 days from now and excludes deadlines past 3 days", async () => {
    const { create, dueSoonScan } = await import("@/lib/actions");
    const u = await createUser("b@example.com");
    const now = new Date("2026-05-06T00:00:00Z");

    const inWindow = await create({
      title: "in",
      assigneeId: u.id,
      deadline: new Date(now.getTime() + 2 * DAY),
      createdBy: u.id,
    });
    const onBoundary = await create({
      title: "boundary",
      assigneeId: u.id,
      deadline: new Date(now.getTime() + 3 * DAY),
      createdBy: u.id,
    });
    const past = await create({
      title: "past",
      assigneeId: u.id,
      deadline: new Date(now.getTime() + 4 * DAY),
      createdBy: u.id,
    });

    const result = await dueSoonScan(now);
    const ids = new Set(result.map((r) => r.id));
    expect(ids.has(inWindow.id)).toBe(true);
    expect(ids.has(onBoundary.id)).toBe(true);
    expect(ids.has(past.id)).toBe(false);
  });

  it("overdueScan includes any open action with deadline <= now", async () => {
    const { create, overdueScan, resolve } = await import("@/lib/actions");
    const u = await createUser("c@example.com");
    const now = new Date("2026-05-06T00:00:00Z");

    const overdueOpen = await create({
      title: "overdue-open",
      assigneeId: u.id,
      deadline: new Date(now.getTime() - DAY),
      createdBy: u.id,
    });
    const overdueResolved = await create({
      title: "overdue-resolved",
      assigneeId: u.id,
      deadline: new Date(now.getTime() - DAY),
      createdBy: u.id,
    });
    await resolve(overdueResolved.id, u.id, null);

    const futureOpen = await create({
      title: "future",
      assigneeId: u.id,
      deadline: new Date(now.getTime() + DAY),
      createdBy: u.id,
    });

    const list = await overdueScan(now);
    const ids = new Set(list.map((r) => r.id));
    expect(ids.has(overdueOpen.id)).toBe(true);
    expect(ids.has(overdueResolved.id)).toBe(false);
    expect(ids.has(futureOpen.id)).toBe(false);
  });
});

describe("runScans — payload + double-notify suppression", () => {
  it("notifies due-soon, persists notification rows with correct shape, suppresses on next run", async () => {
    const { create, runScans, findById } = await import("@/lib/actions");
    const { db } = await import("@/db");
    const { notifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const u = await createUser("d@example.com");
    const now = new Date("2026-05-06T00:00:00Z");

    const a = await create({
      title: "Tighten bolt",
      assigneeId: u.id,
      deadline: new Date(now.getTime() + 2 * DAY),
      createdBy: u.id,
    });

    const r1 = await runScans(now);
    expect(r1.dueSoonNotified).toBe(1);
    expect(r1.events).toHaveLength(1);
    if (r1.events[0]!.kind !== "due_soon") throw new Error("expected due_soon");
    expect(r1.events[0]!.daysUntilDue).toBe(2);
    expect(r1.events[0]!.action.id).toBe(a.id);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("action_due_soon");
    expect(rows[0]!.entityType).toBe("corrective_action");
    expect(rows[0]!.entityId).toBe(a.id);

    const stamped = await findById(a.id);
    expect(stamped?.dueSoonNotifiedAt).not.toBeNull();

    const r2 = await runScans(now);
    expect(r2.dueSoonNotified).toBe(0);
    expect(r2.events).toHaveLength(0);
  });

  it("notifies overdue once, then suppresses", async () => {
    const { create, runScans } = await import("@/lib/actions");
    const u = await createUser("e@example.com");
    const now = new Date("2026-05-06T00:00:00Z");

    const a = await create({
      title: "Patch leak",
      assigneeId: u.id,
      deadline: new Date(now.getTime() - 2 * DAY),
      createdBy: u.id,
    });

    const r1 = await runScans(now);
    expect(r1.overdueNotified).toBe(1);
    if (r1.events[0]!.kind !== "overdue") throw new Error("expected overdue");
    expect(r1.events[0]!.daysOverdue).toBe(2);
    expect(r1.events[0]!.action.id).toBe(a.id);

    const r2 = await runScans(now);
    expect(r2.overdueNotified).toBe(0);
  });

  it("does not notify when assignee is deactivated", async () => {
    const { create, runScans } = await import("@/lib/actions");
    const { db } = await import("@/db");
    const { user, notifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const u = await createUser("f@example.com");
    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, u.id));
    const now = new Date("2026-05-06T00:00:00Z");

    await create({
      title: "x",
      assigneeId: u.id,
      deadline: new Date(now.getTime() + DAY),
      createdBy: u.id,
    });

    const r = await runScans(now);
    expect(r.dueSoonNotified).toBe(0);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(rows).toHaveLength(0);
  });
});
