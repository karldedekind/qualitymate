"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth-helpers";
import { markRead, markAllRead } from "@/lib/notify";

export async function markReadAction(notificationId: number) {
  const u = await getSessionUser();
  if (!u) return { error: "Not signed in" };
  await markRead(notificationId, u.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllReadAction() {
  const u = await getSessionUser();
  if (!u) return { error: "Not signed in" };
  await markAllRead(u.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
