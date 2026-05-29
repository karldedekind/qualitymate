"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptInvite } from "@/lib/users";
import { record } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";

const Schema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(200),
  password: z.string().min(8),
});

export async function acceptInviteAction(formData: FormData) {
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const meta = await getRequestMeta();

  const result = await acceptInvite(parsed.data);
  if (!result.ok) return { error: result.error };

  await record({
    actor: { id: result.userId, email: "" },
    action: "user.invite.accept",
    entity: { type: "user", id: result.userId },
    request: meta,
  });

  redirect("/login?invited=1");
}
