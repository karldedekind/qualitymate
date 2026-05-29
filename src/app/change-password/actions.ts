"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { record } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";
import { getSessionUser } from "@/lib/auth-helpers";
import { clearMustChangePassword } from "@/lib/users";

const Schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function changePasswordAction(formData: FormData) {
  const u = await getSessionUser();
  if (!u) return { error: "Not signed in." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const meta = await getRequestMeta();

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
      headers: await headers(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Password change failed" };
  }

  await clearMustChangePassword(u.id);
  await record({
    actor: { id: u.id, email: u.email },
    action: "user.password.change",
    entity: { type: "user", id: u.id },
    request: meta,
  });

  redirect("/dashboard");
}
