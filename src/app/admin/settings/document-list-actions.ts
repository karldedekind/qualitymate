"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import {
  DOC_LIST_KINDS,
  DocListError,
  type DocListKind,
  addItem,
  moveItem,
  removeItem,
  restoreItem,
  updateItem,
} from "@/lib/document-lists";

type Result = { ok: true; message?: string } | { error: string };

async function run(fn: (ctx: Parameters<typeof addItem>[1]) => Promise<string | void>): Promise<Result> {
  const admin = await requireAdmin();
  const request = await getRequestMeta();
  try {
    const message = await fn({ actor: { id: admin.id, email: admin.email }, request });
    revalidatePath("/admin/settings");
    revalidatePath("/registers/documents", "layout");
    return { ok: true, message: message || undefined };
  } catch (err) {
    if (err instanceof DocListError) return { error: err.message };
    throw err;
  }
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function addDocListItemAction(formData: FormData): Promise<Result> {
  const kind = str(formData, "kind") as DocListKind;
  if (!DOC_LIST_KINDS.includes(kind)) return { error: "Unknown list." };
  return run(async (ctx) => {
    await addItem({ kind, code: str(formData, "code"), label: str(formData, "label") }, ctx);
  });
}

export async function updateDocListItemAction(formData: FormData): Promise<Result> {
  const code = formData.get("code");
  return run(async (ctx) => {
    await updateItem(
      {
        id: str(formData, "id"),
        label: str(formData, "label"),
        code: typeof code === "string" ? code : undefined,
      },
      ctx,
    );
  });
}

export async function moveDocListItemAction(id: string, direction: "up" | "down"): Promise<Result> {
  return run(async (ctx) => moveItem({ id, direction }, ctx));
}

export async function removeDocListItemAction(id: string): Promise<Result> {
  return run(async (ctx) =>
    (await removeItem(id, ctx)) === "retired"
      ? "In use, so retired: hidden from pickers and filters, still shown on its documents."
      : "Deleted.",
  );
}

export async function restoreDocListItemAction(id: string): Promise<Result> {
  return run(async (ctx) => restoreItem(id, ctx));
}
