import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";
import nodemailer from "nodemailer";

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
  await db.execute(sql`TRUNCATE "notifications" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
  const { _setTransportForTests } = await import("@/lib/smtp");
  _setTransportForTests(null);
});

describe("notify.send — fan-out behaviour", () => {
  it("writes an in-app notification row even when no email payload is provided", async () => {
    const u = await createUser("a@example.com");
    const { send, recent, unreadCount } = await import("@/lib/notify");

    const result = await send({
      userId: u.id,
      type: "invite",
      body: "You've been invited.",
    });

    expect(result.notificationId).toBeGreaterThan(0);
    expect(result.emailQueued).toBe(false);
    expect(await unreadCount(u.id)).toBe(1);
    const items = await recent(u.id);
    expect(items[0]?.body).toBe("You've been invited.");
    expect(items[0]?.readAt).toBeNull();
  });

  it("when SMTP unconfigured, in-app row is written and no error surfaces to caller", async () => {
    const u = await createUser("b@example.com");
    const { send } = await import("@/lib/notify");

    const result = await send({
      userId: u.id,
      type: "invite",
      body: "Hi",
      email: { subject: "Hi", text: "test" },
    });

    expect(result.notificationId).toBeGreaterThan(0);
    expect(result.emailQueued).toBe(false);
    expect(result.emailError).toBeNull();
  });

  it("when SMTP configured, email is delivered through the transport", async () => {
    const u = await createUser("c@example.com");
    const { send } = await import("@/lib/notify");
    const { set } = await import("@/lib/settings");
    const { _setTransportForTests } = await import("@/lib/smtp");

    const transport = nodemailer.createTransport({ jsonTransport: true });
    _setTransportForTests(transport);

    await set("smtp.host", "test");
    await set("smtp.port", "587");
    await set("smtp.from_email", "noreply@example.com");

    const result = await send({
      userId: u.id,
      type: "invite",
      body: "Hi",
      email: { subject: "Welcome", text: "Hello", html: "<p>Hello</p>" },
    });

    expect(result.notificationId).toBeGreaterThan(0);
    expect(result.emailQueued).toBe(true);
    expect(result.emailError).toBeNull();
  });

  it("does not email a deactivated user even if SMTP is configured", async () => {
    const u = await createUser("gone@example.com");
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, u.id));

    const { send } = await import("@/lib/notify");
    const { set } = await import("@/lib/settings");
    const { _setTransportForTests } = await import("@/lib/smtp");
    _setTransportForTests(nodemailer.createTransport({ jsonTransport: true }));
    await set("smtp.host", "test");
    await set("smtp.port", "587");
    await set("smtp.from_email", "noreply@example.com");

    const result = await send({
      userId: u.id,
      type: "anything",
      body: "x",
      email: { subject: "x", text: "x" },
    });
    expect(result.emailQueued).toBe(false);
  });
});

describe("notify — read state", () => {
  it("markRead transitions an unread row to read; unreadCount drops", async () => {
    const u = await createUser("d@example.com");
    const { send, markRead, unreadCount } = await import("@/lib/notify");

    const r1 = await send({ userId: u.id, type: "x", body: "one" });
    await send({ userId: u.id, type: "x", body: "two" });
    expect(await unreadCount(u.id)).toBe(2);

    await markRead(r1.notificationId, u.id);
    expect(await unreadCount(u.id)).toBe(1);
  });

  it("markRead refuses to mark another user's notification", async () => {
    const u1 = await createUser("e@example.com");
    const u2 = await createUser("f@example.com");
    const { send, markRead, unreadCount } = await import("@/lib/notify");
    const r = await send({ userId: u1.id, type: "x", body: "one" });
    await markRead(r.notificationId, u2.id);
    expect(await unreadCount(u1.id)).toBe(1);
  });

  it("markAllRead clears all unread for the user only", async () => {
    const u1 = await createUser("g@example.com");
    const u2 = await createUser("h@example.com");
    const { send, markAllRead, unreadCount } = await import("@/lib/notify");
    await send({ userId: u1.id, type: "x", body: "1" });
    await send({ userId: u1.id, type: "x", body: "2" });
    await send({ userId: u2.id, type: "x", body: "3" });

    await markAllRead(u1.id);
    expect(await unreadCount(u1.id)).toBe(0);
    expect(await unreadCount(u2.id)).toBe(1);
  });
});

describe("smtp.testSend", () => {
  it("returns ok=true through a working transport", async () => {
    const { _setTransportForTests, testSend } = await import("@/lib/smtp");
    const { set } = await import("@/lib/settings");
    _setTransportForTests(nodemailer.createTransport({ jsonTransport: true }));
    await set("smtp.from_email", "noreply@example.com");

    const result = await testSend("recipient@example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messageId).toBeTruthy();
  });

  it("returns ok=false with error string on transport failure", async () => {
    const { _setTransportForTests, testSend } = await import("@/lib/smtp");
    const { set } = await import("@/lib/settings");
    const failing = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: false,
    });
    failing.sendMail = async () => {
      throw new Error("connection refused");
    };
    _setTransportForTests(failing);
    await set("smtp.from_email", "noreply@example.com");

    const result = await testSend("recipient@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("connection refused");
  });

  it("returns ok=false with `SMTP not configured` when no SMTP settings exist", async () => {
    const { testSend, _setTransportForTests } = await import("@/lib/smtp");
    _setTransportForTests(null);
    const result = await testSend("anyone@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("SMTP not configured");
  });
});
