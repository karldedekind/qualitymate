import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { session as sessionTable, user } from "@/db/schema";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "site_staff";
  mustChangePassword: boolean;
  deactivated: boolean;
  totpEnabled: boolean;
  sessionId: string;
  mfaVerifiedAt: Date | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const rows = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  const u = rows[0];
  if (!u) return null;

  // session.session.id is the better-auth session row id
  const sessionId = session.session.id;
  const sRows = await db
    .select({ mfaVerifiedAt: sessionTable.mfaVerifiedAt })
    .from(sessionTable)
    .where(eq(sessionTable.id, sessionId))
    .limit(1);

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as "admin" | "site_staff",
    mustChangePassword: u.mustChangePassword,
    deactivated: u.deactivatedAt != null,
    totpEnabled: u.totpEnabledAt != null,
    sessionId,
    mfaVerifiedAt: sRows[0]?.mfaVerifiedAt ?? null,
  };
}

type RequireOpts = {
  /** Skip MFA gate (for the MFA verify page itself + setup pages). */
  skipMfa?: boolean;
};

export async function requireUser(opts: RequireOpts = {}): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login?reason=expired");
  if (sessionUser.deactivated) {
    await auth.api.signOut({ headers: await headers() });
    redirect("/login?error=deactivated");
  }
  if (sessionUser.mustChangePassword) {
    redirect("/change-password");
  }
  if (!opts.skipMfa) {
    // 1. User has TOTP enabled — require session to have passed the gate.
    if (sessionUser.totpEnabled && sessionUser.mfaVerifiedAt == null) {
      redirect("/login/mfa");
    }
    // 2. Org policy: admins must enroll TOTP.
    if (
      sessionUser.role === "admin" &&
      !sessionUser.totpEnabled
    ) {
      const { isMfaRequiredForAdmins } = await import("@/lib/mfa");
      if (await isMfaRequiredForAdmins()) {
        redirect("/account/security/setup");
      }
    }
  }
  return sessionUser;
}

export async function requireRole(role: "admin" | "site_staff"): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== role) redirect("/dashboard");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("admin");
}

export function can(
  u: SessionUser,
  capability:
    | "users.manage"
    | "settings.manage"
    | "audit.export"
    | "incidents.review"
    | "meetings.approve",
): boolean {
  if (u.role === "admin") return true;
  switch (capability) {
    default:
      return false;
  }
}
