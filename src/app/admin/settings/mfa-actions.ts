"use server";

import { revalidatePath } from "next/cache";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { setMfaRequired } from "@/lib/mfa";
import { getRequestMeta } from "@/lib/request-meta";

export async function saveMfaRequiredAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const enabled = formData.get("require") === "true";
  await setMfaRequired(enabled, { id: admin.id });
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "mfa.policy.update",
    entity: { type: "settings", id: "mfa.require_all_admins" },
    after: { requireAllAdmins: enabled },
    request: meta,
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}
