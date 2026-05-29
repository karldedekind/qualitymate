"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema";
import { record } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";
import {
  getStatus,
  saveCompanyInfo,
  markComplete,
  unlockForRecovery,
  hasAnyAdmin,
} from "@/lib/setup-state";
import { set as setSetting, KNOWN_KEYS, invalidate as invalidateSettings } from "@/lib/settings";

const SetupSchema = z.object({
  companyName: z.string().min(1).max(200),
  companyShortName: z.string().min(1).max(50),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  adminName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  recoveryToken: z.string().optional(),
});

export async function completeSetupAction(formData: FormData) {
  const parsed = SetupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const status = await getStatus(input.recoveryToken ?? null);
  if (status.completed && !status.unlockedByRecovery) {
    return { error: "Setup already completed." };
  }
  if (status.unlockedByRecovery) {
    if (await hasAnyAdmin()) {
      return { error: "Admin already exists; recovery not applicable." };
    }
    await unlockForRecovery();
  }

  const meta = await getRequestMeta();

  await saveCompanyInfo({
    companyName: input.companyName,
    companyShortName: input.companyShortName,
    primaryColor: input.primaryColor,
  });

  try {
    await auth.api.signUpEmail({
      body: {
        email: input.adminEmail,
        password: input.adminPassword,
        name: input.adminName,
      },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create admin user" };
  }

  await db
    .update(user)
    .set({ role: "admin", emailVerified: true })
    .where(eq(user.email, input.adminEmail));

  const created = await db.select().from(user).where(eq(user.email, input.adminEmail)).limit(1);
  const adminId = created[0]?.id ?? null;

  await markComplete();

  const adminActor = adminId ? { id: adminId } : undefined;
  await setSetting(KNOWN_KEYS.COMPANY_NAME, input.companyName, { actor: adminActor });
  await setSetting(KNOWN_KEYS.COMPANY_SHORT_NAME, input.companyShortName, { actor: adminActor });
  await setSetting(KNOWN_KEYS.PRIMARY_COLOR, input.primaryColor, { actor: adminActor });
  if (adminId) {
    await setSetting(KNOWN_KEYS.ISO_MANAGEMENT_REP, adminId, { actor: adminActor });
  }
  invalidateSettings();

  await record({
    actor: adminId ? { id: adminId, email: input.adminEmail } : null,
    action: "setup.complete",
    entity: { type: "setup_state", id: "1" },
    after: {
      companyName: input.companyName,
      companyShortName: input.companyShortName,
      adminEmail: input.adminEmail,
    },
    request: meta,
  });

  redirect("/login");
}
