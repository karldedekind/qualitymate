import { randomBytes } from "node:crypto";
import { and, eq, isNull, isNotNull, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { account, invite, session, user } from "@/db/schema";
import { auth } from "@/lib/auth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function newId(): string {
  return randomBytes(16).toString("base64url");
}

export type Role = "admin" | "site_staff";

export type CreatedInvite = {
  id: string;
  token: string;
  email: string;
  role: Role;
  expiresAt: Date;
  link: string;
};

export async function inviteUser(input: {
  email: string;
  role: Role;
  invitedBy: string;
  appUrl?: string;
}): Promise<CreatedInvite> {
  const token = newToken();
  const id = newId();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(invite).values({
    id,
    email: input.email.toLowerCase(),
    role: input.role,
    token,
    expiresAt,
    invitedBy: input.invitedBy,
  });
  const base = (input.appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    id,
    token,
    email: input.email.toLowerCase(),
    role: input.role,
    expiresAt,
    link: `${base}/invite/${token}`,
  };
}

export async function findInviteByToken(token: string) {
  const rows = await db.select().from(invite).where(eq(invite.token, token)).limit(1);
  return rows[0] ?? null;
}

export type AcceptInviteResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AcceptInviteResult> {
  const inv = await findInviteByToken(input.token);
  if (!inv) return { ok: false, error: "Invitation not found." };
  if (inv.usedAt) return { ok: false, error: "Invitation already used." };
  if (inv.expiresAt < new Date()) return { ok: false, error: "Invitation expired." };

  const existing = await db.select().from(user).where(eq(user.email, inv.email)).limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "An account already exists for that email." };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: inv.email,
        password: input.password,
        name: input.name,
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sign-up failed" };
  }

  const created = await db.select().from(user).where(eq(user.email, inv.email)).limit(1);
  const u = created[0];
  if (!u) return { ok: false, error: "User not created." };

  await db
    .update(user)
    .set({ role: inv.role, emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, u.id));

  await db.update(invite).set({ usedAt: new Date() }).where(eq(invite.id, inv.id));

  return { ok: true, userId: u.id };
}

export async function deactivateUser(userId: string): Promise<void> {
  await db.update(user).set({ deactivatedAt: new Date(), updatedAt: new Date() }).where(eq(user.id, userId));
  await db.delete(session).where(eq(session.userId, userId));
}

export async function reactivateUser(userId: string): Promise<void> {
  await db.update(user).set({ deactivatedAt: null, updatedAt: new Date() }).where(eq(user.id, userId));
}

export async function setRole(userId: string, role: Role): Promise<void> {
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId));
}

export type AdminResetResult = { tempPassword: string };

function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function adminResetPassword(targetUserId: string): Promise<AdminResetResult> {
  const tempPassword = generateTempPassword();

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(tempPassword);

  const accounts = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, targetUserId), eq(account.providerId, "credential")));

  if (accounts.length === 0) {
    await db.insert(account).values({
      id: newId(),
      userId: targetUserId,
      accountId: targetUserId,
      providerId: "credential",
      password: hash,
    });
  } else {
    await db
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(account.userId, targetUserId), eq(account.providerId, "credential")));
  }

  await db
    .update(user)
    .set({ mustChangePassword: true, updatedAt: new Date() })
    .where(eq(user.id, targetUserId));

  await db.delete(session).where(eq(session.userId, targetUserId));

  return { tempPassword };
}

export async function clearMustChangePassword(userId: string): Promise<void> {
  await db
    .update(user)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function listUsers(): Promise<{
  active: (typeof user.$inferSelect)[];
  deactivated: (typeof user.$inferSelect)[];
}> {
  const active = await db
    .select()
    .from(user)
    .where(isNull(user.deactivatedAt))
    .orderBy(asc(user.email));
  const deactivated = await db
    .select()
    .from(user)
    .where(isNotNull(user.deactivatedAt))
    .orderBy(desc(user.deactivatedAt));
  return { active, deactivated };
}

export async function findUserById(id: string) {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return rows[0] ?? null;
}
