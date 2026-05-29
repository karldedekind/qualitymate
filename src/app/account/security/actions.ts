"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/auth-helpers";
import { getBranding } from "@/lib/branding";
import {
  confirmEnrollment,
  disableMfa,
  markSessionVerified,
  regenerateRecoveryCodes,
  startEnrollment,
  type Enrollment,
} from "@/lib/mfa";
import { getRequestMeta } from "@/lib/request-meta";

export type StartResult =
  | { ok: true; enrollment: Enrollment }
  | { error: string };

export async function startMfaEnrollmentAction(): Promise<StartResult> {
  const u = await requireUser({ skipMfa: true });
  const meta = await getRequestMeta();
  const branding = await getBranding();
  const enrollment = await startEnrollment(u.id, u.email, branding.companyName);
  await record({
    actor: { id: u.id, email: u.email },
    action: "mfa.enroll.start",
    entity: { type: "user", id: u.id },
    request: meta,
  });
  return { ok: true, enrollment };
}

const ConfirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function confirmMfaEnrollmentAction(formData: FormData) {
  const u = await requireUser({ skipMfa: true });
  const parsed = ConfirmSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: "Enter the 6-digit code from your app." };
  const meta = await getRequestMeta();
  const r = await confirmEnrollment(u.id, parsed.data.code);
  if (!r.ok) {
    await record({
      actor: { id: u.id, email: u.email },
      action: "mfa.enroll.failure",
      entity: { type: "user", id: u.id },
      after: { code: r.code },
      request: meta,
    });
    return { error: r.error };
  }
  // Mark this session verified so the user is not redirected straight back to /login/mfa.
  await markSessionVerified(u.sessionId);
  await record({
    actor: { id: u.id, email: u.email },
    action: "mfa.enroll.confirm",
    entity: { type: "user", id: u.id },
    request: meta,
  });
  revalidatePath("/account/security");
  return { ok: true };
}

export async function disableMfaAction() {
  const u = await requireUser({ skipMfa: true });
  const meta = await getRequestMeta();
  await disableMfa(u.id);
  await record({
    actor: { id: u.id, email: u.email },
    action: "mfa.disable",
    entity: { type: "user", id: u.id },
    request: meta,
  });
  revalidatePath("/account/security");
  return { ok: true };
}

export async function regenerateRecoveryAction() {
  const u = await requireUser({ skipMfa: true });
  const meta = await getRequestMeta();
  const codes = await regenerateRecoveryCodes(u.id);
  await record({
    actor: { id: u.id, email: u.email },
    action: "mfa.recovery.regenerate",
    entity: { type: "user", id: u.id },
    after: { count: codes.length },
    request: meta,
  });
  return { ok: true, codes };
}
