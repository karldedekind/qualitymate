import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

beforeAll(async () => {
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
  await db.execute(sql`UPDATE "setup_state" SET step = 'welcome', completed_at = NULL, company_name = NULL, company_short_name = NULL, primary_color = NULL WHERE id = 1`);
  const { _resetForTests } = await import("@/lib/rate-limit");
  _resetForTests();
});

describe("audit log", () => {
  it("records an event with snapshot of user email, IP, and UA", async () => {
    const { record, history } = await import("@/lib/audit");

    await record({
      actor: { id: "u1", email: "alice@example.com" },
      action: "incident.create",
      entity: { type: "incident", id: "i1" },
      before: null,
      after: { title: "Spill" },
      request: { ip: "10.0.0.1", userAgent: "TestAgent/1.0" },
    });

    const events = await history("incident", "i1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "incident.create",
      userId: "u1",
      userEmailSnapshot: "alice@example.com",
      ip: "10.0.0.1",
      userAgent: "TestAgent/1.0",
      after: { title: "Spill" },
    });
  });

  it("history returns events in reverse chronological order", async () => {
    const { record, history } = await import("@/lib/audit");
    const actor = { id: "u1", email: "a@b.com" };

    await record({ actor, action: "step.1", entity: { type: "thing", id: "x" } });
    await record({ actor, action: "step.2", entity: { type: "thing", id: "x" } });
    await record({ actor, action: "step.3", entity: { type: "thing", id: "x" } });

    const events = await history("thing", "x");
    expect(events.map((e) => e.action)).toEqual(["step.3", "step.2", "step.1"]);
  });

  it("preserves user email snapshot independent of actor changes", async () => {
    const { record, history } = await import("@/lib/audit");

    await record({
      actor: { id: "u1", email: "old@example.com" },
      action: "thing.create",
      entity: { type: "thing", id: "y" },
    });

    const events = await history("thing", "y");
    expect(events[0]?.userEmailSnapshot).toBe("old@example.com");
  });
});

describe("rate limit", () => {
  it("allows attempts under the threshold", async () => {
    const { checkLogin, recordLoginFailure } = await import("@/lib/rate-limit");
    const ip = "1.2.3.4";
    const email = "user@example.com";

    for (let i = 0; i < 4; i++) {
      expect(checkLogin(ip, email).ok).toBe(true);
      recordLoginFailure(ip, email);
    }
    expect(checkLogin(ip, email).ok).toBe(true);
  });

  it("blocks after 5 failures within 15 minutes", async () => {
    const { checkLogin, recordLoginFailure } = await import("@/lib/rate-limit");
    const ip = "5.6.7.8";
    const email = "blocked@example.com";

    for (let i = 0; i < 5; i++) recordLoginFailure(ip, email);

    const result = checkLogin(ip, email);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(15 * 60 * 1000);
    }
  });

  it("unblocks after the cooldown window passes", async () => {
    const { checkLogin, recordLoginFailure } = await import("@/lib/rate-limit");
    const ip = "9.9.9.9";
    const email = "cooled@example.com";
    const start = Date.now();

    for (let i = 0; i < 5; i++) recordLoginFailure(ip, email, start);
    expect(checkLogin(ip, email, start + 1_000).ok).toBe(false);
    expect(checkLogin(ip, email, start + 16 * 60 * 1000).ok).toBe(true);
  });

  it("blocks per IP independently of email", async () => {
    const { checkLogin, recordLoginFailure } = await import("@/lib/rate-limit");
    const ip = "10.10.10.10";

    for (let i = 0; i < 5; i++) recordLoginFailure(ip, `user${i}@example.com`);

    expect(checkLogin(ip, "fresh@example.com").ok).toBe(false);
  });
});

describe("setup state", () => {
  it("starts unlocked on empty database", async () => {
    const { isLocked, getStatus } = await import("@/lib/setup-state");
    expect(await isLocked()).toBe(false);
    const status = await getStatus();
    expect(status.completed).toBe(false);
  });

  it("locks after setup is marked complete", async () => {
    const { markComplete, isLocked } = await import("@/lib/setup-state");
    await markComplete();
    expect(await isLocked()).toBe(true);
  });

  it("unlocks via recovery passphrase only when admin table is empty", async () => {
    const { markComplete, getStatus } = await import("@/lib/setup-state");

    process.env.RECOVERY_PASSPHRASE = "secret-pass";

    await markComplete();

    const wrongPass = await getStatus("wrong");
    expect(wrongPass.unlockedByRecovery).toBe(false);

    const rightPassEmptyTable = await getStatus("secret-pass");
    expect(rightPassEmptyTable.unlockedByRecovery).toBe(true);

    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    await db.insert(user).values({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });

    const rightPassWithAdmin = await getStatus("secret-pass");
    expect(rightPassWithAdmin.unlockedByRecovery).toBe(false);
  });
});
