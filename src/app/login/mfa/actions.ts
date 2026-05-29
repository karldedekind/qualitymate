"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-helpers";
import { markSessionVerified, verifyLogin } from "@/lib/mfa";
import { getRequestMeta } from "@/lib/request-meta";

const Schema = z.object({ code: z.string().min(4).max(64) });

export async function verifyMfaAction(formData: FormData) {
  const parsed = Schema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: "Enter your 6-digit code or a recovery code." };

  const session = await getSessionUser();
  if (!session) {
    return { error: "Session expired. Sign in again." };
  }
  const meta = await getRequestMeta();
  const r = await verifyLogin(session.id, parsed.data.code);
  if (!r.ok) {
    await record({
      actor: { id: session.id, email: session.email },
      action: "mfa.verify.failure",
      entity: { type: "user", id: session.id },
      after: { code: r.code },
      request: meta,
    });
    return { error: r.error };
  }
  await markSessionVerified(session.sessionId);
  await record({
    actor: { id: session.id, email: session.email },
    action: r.usedRecoveryCode ? "mfa.recovery.consume" : "mfa.verify.success",
    entity: { type: "user", id: session.id },
    after: r.usedRecoveryCode
      ? { recoveryCodesRemaining: r.recoveryCodesRemaining }
      : null,
    request: meta,
  });

  redirect("/dashboard");
}
