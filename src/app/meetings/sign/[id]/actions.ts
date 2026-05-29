"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { recordSignoff } from "@/lib/meetings";
import { getRequestMeta } from "@/lib/request-meta";

const Schema = z.object({
  id: z.string().min(1),
  token: z.string().min(8),
});

export async function signoffAction(formData: FormData) {
  const parsed = Schema.safeParse({
    id: formData.get("id"),
    token: formData.get("token"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const meta = await getRequestMeta();
  const result = await recordSignoff(parsed.data.id, parsed.data.token, meta.ip ?? null);
  if (!result.ok) {
    await record({
      actor: null,
      action: "meeting.signoff.rejected",
      entity: { type: "meeting", id: parsed.data.id },
      after: { code: result.code, error: result.error },
      request: meta,
    });
    return { error: result.error };
  }

  await record({
    actor: null,
    action: result.alreadySigned ? "meeting.signoff.duplicate" : "meeting.signoff",
    entity: { type: "meeting", id: parsed.data.id },
    after: { signoffs: result.meeting.signoffs.length },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return { ok: true, alreadySigned: result.alreadySigned };
}
