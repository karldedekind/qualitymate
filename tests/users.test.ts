import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createTestUser(email: string, password: string, role: "admin" | "site_staff" = "site_staff") {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  await auth.api.signUpEmail({
    body: { email, password, name: email.split("@")[0]! },
  });
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
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "invite" CASCADE`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

describe("inviteUser", () => {
  it("creates an invite row with token, role, and future expiry — no user yet", async () => {
    const { inviteUser } = await import("@/lib/users");
    const { db } = await import("@/db");
    const { invite, user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const inviter = await createTestUser("inviter@example.com", "passw0rd!", "admin");

    const result = await inviteUser({
      email: "Newbie@Example.com",
      role: "site_staff",
      invitedBy: inviter.id,
    });

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(result.email).toBe("newbie@example.com");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.link).toContain(`/invite/${result.token}`);

    const rows = await db.select().from(invite).where(eq(invite.token, result.token));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.usedAt).toBeNull();

    const usersForEmail = await db.select().from(user).where(eq(user.email, "newbie@example.com"));
    expect(usersForEmail).toHaveLength(0);
  });

  it("acceptInvite consumes the token and creates an active user with the invited role", async () => {
    const { inviteUser, acceptInvite } = await import("@/lib/users");
    const { db } = await import("@/db");
    const { invite, user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const inviter = await createTestUser("inviter@example.com", "passw0rd!", "admin");

    const inv = await inviteUser({
      email: "fresh@example.com",
      role: "admin",
      invitedBy: inviter.id,
    });

    const result = await acceptInvite({
      token: inv.token,
      name: "Fresh Person",
      password: "newpassword1",
    });

    expect(result.ok).toBe(true);

    const consumed = await db.select().from(invite).where(eq(invite.token, inv.token));
    expect(consumed[0]?.usedAt).not.toBeNull();

    const users = await db.select().from(user).where(eq(user.email, "fresh@example.com"));
    expect(users).toHaveLength(1);
    expect(users[0]?.role).toBe("admin");
  });

  it("rejects an already-used invite", async () => {
    const { inviteUser, acceptInvite } = await import("@/lib/users");

    const inviter = await createTestUser("inviter@example.com", "passw0rd!", "admin");
    const inv = await inviteUser({ email: "x@example.com", role: "site_staff", invitedBy: inviter.id });

    const first = await acceptInvite({ token: inv.token, name: "X", password: "passw0rd1" });
    expect(first.ok).toBe(true);

    const second = await acceptInvite({ token: inv.token, name: "X", password: "passw0rd1" });
    expect(second.ok).toBe(false);
  });

  it("rejects an expired invite", async () => {
    const { inviteUser, acceptInvite } = await import("@/lib/users");
    const { db } = await import("@/db");
    const { invite } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const inviter = await createTestUser("inviter@example.com", "passw0rd!", "admin");
    const inv = await inviteUser({ email: "exp@example.com", role: "site_staff", invitedBy: inviter.id });

    await db
      .update(invite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invite.token, inv.token));

    const result = await acceptInvite({ token: inv.token, name: "X", password: "passw0rd1" });
    expect(result.ok).toBe(false);
  });
});

describe("deactivateUser", () => {
  it("sets deactivated_at, deletes sessions, leaves audit history intact", async () => {
    const { deactivateUser } = await import("@/lib/users");
    const { record, history } = await import("@/lib/audit");
    const { db } = await import("@/db");
    const { user, session } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const u = await createTestUser("leave@example.com", "passw0rd!");

    await db.insert(session).values({
      id: "s1",
      userId: u.id,
      token: "t1",
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await record({
      actor: { id: u.id, email: u.email },
      action: "thing.create",
      entity: { type: "thing", id: "h1" },
      after: { ok: true },
    });

    await deactivateUser(u.id);

    const reloaded = (await db.select().from(user).where(eq(user.id, u.id)))[0];
    expect(reloaded?.deactivatedAt).not.toBeNull();

    const remainingSessions = await db.select().from(session).where(eq(session.userId, u.id));
    expect(remainingSessions).toHaveLength(0);

    const events = await history("thing", "h1");
    expect(events[0]?.userEmailSnapshot).toBe("leave@example.com");
  });
});

describe("setRole", () => {
  it("changes the role", async () => {
    const { setRole, findUserById } = await import("@/lib/users");
    const u = await createTestUser("promo@example.com", "passw0rd!");
    expect(u.role).toBe("site_staff");
    await setRole(u.id, "admin");
    const after = await findUserById(u.id);
    expect(after?.role).toBe("admin");
  });
});

describe("adminResetPassword", () => {
  it("returns a temp password, deletes existing sessions, sets must_change_password", async () => {
    const { adminResetPassword } = await import("@/lib/users");
    const { db } = await import("@/db");
    const { user, session } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const u = await createTestUser("reset@example.com", "originalPw1!");

    await db.insert(session).values({
      id: "s-existing",
      userId: u.id,
      token: "t-existing",
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const result = await adminResetPassword(u.id);
    expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);

    const sessions = await db.select().from(session).where(eq(session.userId, u.id));
    expect(sessions).toHaveLength(0);

    const after = (await db.select().from(user).where(eq(user.id, u.id)))[0];
    expect(after?.mustChangePassword).toBe(true);
  });

  it("temp password is accepted by signInEmail; the original password no longer is", async () => {
    const { adminResetPassword } = await import("@/lib/users");
    const { auth } = await import("@/lib/auth");

    const u = await createTestUser("rotate@example.com", "originalPw1!");
    const { tempPassword } = await adminResetPassword(u.id);

    const oldFails = await auth.api
      .signInEmail({ body: { email: "rotate@example.com", password: "originalPw1!" } })
      .then(() => "ok")
      .catch((e) => `err:${e instanceof Error ? e.message : "x"}`);
    expect(oldFails).toMatch(/^err:/);

    const newWorks = await auth.api.signInEmail({
      body: { email: "rotate@example.com", password: tempPassword },
    });
    expect(newWorks).toBeTruthy();
  });
});
