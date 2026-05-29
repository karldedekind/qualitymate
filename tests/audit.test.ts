import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

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
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

describe("audit — write sequence produces expected before/after diffs", () => {
  it("create then update yields the right snapshot pair", async () => {
    const { record, history } = await import("@/lib/audit");
    const actor = { id: "u1", email: "a@b.com" };

    await record({
      actor,
      action: "incident.create",
      entity: { type: "incident", id: "x" },
      before: null,
      after: { title: "Spill", priority: "low" },
    });
    await record({
      actor,
      action: "incident.update",
      entity: { type: "incident", id: "x" },
      before: { title: "Spill", priority: "low" },
      after: { title: "Spill", priority: "high" },
    });

    const events = await history("incident", "x");
    expect(events).toHaveLength(2);
    expect(events[0]?.action).toBe("incident.update");
    expect(events[0]?.before).toEqual({ title: "Spill", priority: "low" });
    expect(events[0]?.after).toEqual({ title: "Spill", priority: "high" });
    expect(events[1]?.action).toBe("incident.create");
    expect(events[1]?.before).toBeNull();
  });
});

describe("audit — query filters", () => {
  it("filters by date range", async () => {
    const { record, query } = await import("@/lib/audit");
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");

    await record({ actor: null, action: "old", entity: { type: "thing", id: "1" } });
    await db.execute(sql`UPDATE ${auditLog} SET ts = '2026-01-01 00:00:00' WHERE action = 'old'`);
    await record({ actor: null, action: "new", entity: { type: "thing", id: "2" } });

    const after = await query({ from: new Date("2026-03-01") });
    expect(after.map((e) => e.action)).toEqual(["new"]);

    const before = await query({ to: new Date("2026-02-01") });
    expect(before.map((e) => e.action)).toEqual(["old"]);
  });

  it("filters by entity type", async () => {
    const { record, query } = await import("@/lib/audit");
    await record({ actor: null, action: "a", entity: { type: "incident", id: "1" } });
    await record({ actor: null, action: "b", entity: { type: "action", id: "1" } });

    const incidents = await query({ entityType: "incident" });
    expect(incidents.map((e) => e.action)).toEqual(["a"]);
  });
});

describe("audit — user_email_snapshot survives soft-delete", () => {
  it("keeps the email after the user is deactivated", async () => {
    const { record, history } = await import("@/lib/audit");
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await db.insert(user).values({
      id: "user-x",
      email: "leaver@example.com",
      name: "Quitter",
      role: "site_staff",
    });

    await record({
      actor: { id: "user-x", email: "leaver@example.com" },
      action: "thing.create",
      entity: { type: "thing", id: "k" },
      after: { ok: true },
    });

    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, "user-x"));

    const events = await history("thing", "k");
    expect(events[0]?.userEmailSnapshot).toBe("leaver@example.com");
    expect(events[0]?.userId).toBe("user-x");
  });
});

describe("audit-export — CSV", () => {
  it("emits header + one row per event with quoting for commas/quotes", async () => {
    const { toCsv } = await import("@/lib/audit-export");
    const events = [
      {
        id: 1,
        ts: new Date("2026-05-01T12:00:00Z"),
        userId: "u1",
        userEmailSnapshot: 'a"b@example.com',
        entityType: "incident",
        entityId: "1",
        action: "incident.create",
        before: null,
        after: { title: "Has, comma" },
        ip: "10.0.0.1",
        userAgent: "TestAgent/1.0",
      },
    ] as never;
    const csv = await toCsv(events);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("id,timestamp,user_email");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"a""b@example.com"');
    expect(lines[1]).toContain('"{""title"":""Has, comma""}"');
  });
});

describe("audit-export — PDF", () => {
  it("produces a non-empty PDF buffer", async () => {
    const { toPdf } = await import("@/lib/audit-export");
    const events = [
      {
        id: 1,
        ts: new Date("2026-05-01T12:00:00Z"),
        userId: "u1",
        userEmailSnapshot: "a@b.com",
        entityType: "incident",
        entityId: "1",
        action: "incident.create",
        before: null,
        after: { title: "test" },
        ip: "10.0.0.1",
        userAgent: "TestAgent/1.0",
      },
    ] as never;
    const buf = await toPdf(events, { companyName: "Test Co", primaryColor: "#ff0000" });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
