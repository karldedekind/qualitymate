import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

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
  await db.execute(sql`TRUNCATE "settings"`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

describe("MFA enrollment + login flow", () => {
  it("startEnrollment returns secret + QR URI + 10 recovery codes; storage is hashed", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment } = await import("@/lib/mfa");
    const enrollment = await startEnrollment(u.id, u.email, "QualityMate");
    expect(enrollment.secret.length).toBeGreaterThan(0);
    expect(enrollment.uri.startsWith("otpauth://totp/")).toBe(true);
    expect(enrollment.recoveryCodes).toHaveLength(10);
    for (const c of enrollment.recoveryCodes) {
      expect(c).toMatch(/^[0-9a-f]{12}$/);
    }
    // Stored values are hashes, not the plaintext codes.
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(user).where(eq(user.id, u.id));
    const storedHashes = rows[0]!.totpRecoveryCodes;
    expect(storedHashes).toHaveLength(10);
    for (const c of enrollment.recoveryCodes) {
      expect(storedHashes).not.toContain(c);
    }
    // Until confirmEnrollment runs, totpEnabledAt is null.
    expect(rows[0]!.totpEnabledAt).toBeNull();
  });

  it("confirmEnrollment with a valid TOTP code marks enrollment", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment, confirmEnrollment, isMfaEnabled } = await import("@/lib/mfa");
    const { totp } = await import("@/lib/totp");
    const e = await startEnrollment(u.id, u.email, "QualityMate");
    const now = new Date();
    const code = totp(e.secret, now.getTime());
    const r = await confirmEnrollment(u.id, code, now);
    expect(r.ok).toBe(true);
    expect(await isMfaEnabled(u.id)).toBe(true);
  });

  it("confirmEnrollment rejects an invalid code", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment, confirmEnrollment } = await import("@/lib/mfa");
    await startEnrollment(u.id, u.email, "QualityMate");
    const r = await confirmEnrollment(u.id, "000000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_CODE");
  });

  it("verifyLogin accepts a TOTP code without burning recovery codes", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment, confirmEnrollment, verifyLogin } = await import("@/lib/mfa");
    const { totp } = await import("@/lib/totp");
    const e = await startEnrollment(u.id, u.email, "QualityMate");
    const t = new Date();
    await confirmEnrollment(u.id, totp(e.secret, t.getTime()), t);
    const r = await verifyLogin(u.id, totp(e.secret, t.getTime()), t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usedRecoveryCode).toBe(false);
      expect(r.recoveryCodesRemaining).toBe(10);
    }
  });

  it("verifyLogin accepts a recovery code and burns it (one-shot)", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment, confirmEnrollment, verifyLogin } = await import("@/lib/mfa");
    const { totp } = await import("@/lib/totp");
    const e = await startEnrollment(u.id, u.email, "QualityMate");
    const t = new Date();
    await confirmEnrollment(u.id, totp(e.secret, t.getTime()), t);
    const recovery = e.recoveryCodes[0]!;

    const first = await verifyLogin(u.id, recovery, t);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.usedRecoveryCode).toBe(true);
      expect(first.recoveryCodesRemaining).toBe(9);
    }

    // Same recovery code must not work again.
    const second = await verifyLogin(u.id, recovery, t);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("INVALID");
  });

  it("verifyLogin returns NOT_ENROLLED for users without TOTP", async () => {
    const u = await createUser("admin@example.com");
    const { verifyLogin } = await import("@/lib/mfa");
    const r = await verifyLogin(u.id, "123456");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_ENROLLED");
  });

  it("disableMfa clears secret + recovery codes", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment, confirmEnrollment, disableMfa, isMfaEnabled } = await import(
      "@/lib/mfa"
    );
    const { totp } = await import("@/lib/totp");
    const e = await startEnrollment(u.id, u.email, "QualityMate");
    await confirmEnrollment(u.id, totp(e.secret, Date.now()));
    expect(await isMfaEnabled(u.id)).toBe(true);
    await disableMfa(u.id);
    expect(await isMfaEnabled(u.id)).toBe(false);
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(user).where(eq(user.id, u.id));
    expect(rows[0]!.totpSecret).toBeNull();
    expect(rows[0]!.totpRecoveryCodes).toHaveLength(0);
  });

  it("regenerateRecoveryCodes invalidates old codes", async () => {
    const u = await createUser("admin@example.com");
    const { startEnrollment, confirmEnrollment, verifyLogin, regenerateRecoveryCodes } =
      await import("@/lib/mfa");
    const { totp } = await import("@/lib/totp");
    const e = await startEnrollment(u.id, u.email, "QualityMate");
    await confirmEnrollment(u.id, totp(e.secret, Date.now()));
    const oldCode = e.recoveryCodes[0]!;
    const newCodes = await regenerateRecoveryCodes(u.id);
    expect(newCodes).toHaveLength(10);
    const r = await verifyLogin(u.id, oldCode);
    expect(r.ok).toBe(false);
    const r2 = await verifyLogin(u.id, newCodes[0]!);
    expect(r2.ok).toBe(true);
  });

  it("isMfaRequiredForAdmins reflects setting state", async () => {
    const { isMfaRequiredForAdmins, setMfaRequired } = await import("@/lib/mfa");
    expect(await isMfaRequiredForAdmins()).toBe(false);
    await setMfaRequired(true);
    expect(await isMfaRequiredForAdmins()).toBe(true);
    await setMfaRequired(false);
    expect(await isMfaRequiredForAdmins()).toBe(false);
  });
});
