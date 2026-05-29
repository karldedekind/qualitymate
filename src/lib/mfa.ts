import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { session, user } from "@/db/schema";
import { get, KNOWN_KEYS } from "@/lib/settings";
import { buildOtpauthUri, generateSecret, verifyTotp } from "@/lib/totp";

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 6; // 12 hex chars

function newRecoveryCode(): string {
  return randomBytes(RECOVERY_CODE_BYTES).toString("hex");
}

function hashRecovery(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

function constantHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export type Enrollment = {
  secret: string;
  uri: string;
  recoveryCodes: string[]; // plaintext, shown once
};

/**
 * Issue a fresh secret + recovery codes for `userId`. Stored values are the
 * secret (so we can verify the confirm step) and the SHA-256 of each code.
 * Until `confirmEnrollment` runs, `totp_enabled_at` stays NULL — login is
 * not gated by an unconfirmed secret.
 */
export async function startEnrollment(
  userId: string,
  accountName: string,
  issuer: string,
): Promise<Enrollment> {
  const secret = generateSecret(20);
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const c = newRecoveryCode();
    codes.push(c);
    hashes.push(hashRecovery(c));
  }
  await db
    .update(user)
    .set({
      totpSecret: secret,
      totpEnabledAt: null,
      totpRecoveryCodes: hashes,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
  return {
    secret,
    uri: buildOtpauthUri({ secretBase32: secret, accountName, issuer }),
    recoveryCodes: codes,
  };
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; code: "NO_PENDING" | "INVALID_CODE"; error: string };

export async function confirmEnrollment(
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<ConfirmResult> {
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const u = rows[0];
  if (!u || !u.totpSecret) {
    return { ok: false, code: "NO_PENDING", error: "Start TOTP enrollment first." };
  }
  if (!verifyTotp(u.totpSecret, code, { time: now.getTime() })) {
    return { ok: false, code: "INVALID_CODE", error: "Invalid code. Try again." };
  }
  await db.update(user).set({ totpEnabledAt: now, updatedAt: now }).where(eq(user.id, userId));
  return { ok: true };
}

export async function disableMfa(userId: string): Promise<void> {
  await db
    .update(user)
    .set({
      totpSecret: null,
      totpEnabledAt: null,
      totpRecoveryCodes: [],
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

export async function isMfaEnabled(userId: string): Promise<boolean> {
  const rows = await db
    .select({ enabled: user.totpEnabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.enabled != null;
}

export async function isMfaRequiredForAdmins(): Promise<boolean> {
  const v = await get(KNOWN_KEYS.MFA_REQUIRE_ALL_ADMINS);
  return v === "true";
}

export async function setMfaRequired(value: boolean, actor?: { id: string }): Promise<void> {
  const { set } = await import("@/lib/settings");
  await set(KNOWN_KEYS.MFA_REQUIRE_ALL_ADMINS, value ? "true" : "false", { actor });
}

export type LoginVerifyResult =
  | { ok: true; usedRecoveryCode: boolean; recoveryCodesRemaining: number }
  | { ok: false; code: "INVALID" | "NOT_ENROLLED"; error: string };

/**
 * Verify a TOTP code or a recovery code for the user. Recovery codes are
 * burned (removed from the stored hash list) on success.
 */
export async function verifyLogin(
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<LoginVerifyResult> {
  const rows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  const u = rows[0];
  if (!u || !u.totpSecret || !u.totpEnabledAt) {
    return { ok: false, code: "NOT_ENROLLED", error: "TOTP is not enabled for this user." };
  }

  const cleaned = code.replace(/\s/g, "");

  // 6-digit TOTP path.
  if (/^\d{6}$/.test(cleaned)) {
    if (verifyTotp(u.totpSecret, cleaned, { time: now.getTime() })) {
      return {
        ok: true,
        usedRecoveryCode: false,
        recoveryCodesRemaining: u.totpRecoveryCodes.length,
      };
    }
    return { ok: false, code: "INVALID", error: "Invalid code." };
  }

  // Recovery-code path.
  const submittedHash = hashRecovery(cleaned);
  const matchIdx = u.totpRecoveryCodes.findIndex((h) => constantHexEqual(h, submittedHash));
  if (matchIdx === -1) {
    return { ok: false, code: "INVALID", error: "Invalid code." };
  }
  const remaining = u.totpRecoveryCodes.filter((_, i) => i !== matchIdx);
  await db
    .update(user)
    .set({ totpRecoveryCodes: remaining, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return { ok: true, usedRecoveryCode: true, recoveryCodesRemaining: remaining.length };
}

/** Mark a session as having passed the MFA gate (call right after verifyLogin). */
export async function markSessionVerified(sessionId: string, now: Date = new Date()): Promise<void> {
  await db.update(session).set({ mfaVerifiedAt: now }).where(eq(session.id, sessionId));
}

export async function getSessionMfaState(sessionId: string): Promise<{ verifiedAt: Date | null } | null> {
  const rows = await db
    .select({ verifiedAt: session.mfaVerifiedAt })
    .from(session)
    .where(eq(session.id, sessionId))
    .limit(1);
  if (rows.length === 0) return null;
  return { verifiedAt: rows[0]!.verifiedAt };
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const c = newRecoveryCode();
    codes.push(c);
    hashes.push(hashRecovery(c));
  }
  await db
    .update(user)
    .set({ totpRecoveryCodes: hashes, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return codes;
}
