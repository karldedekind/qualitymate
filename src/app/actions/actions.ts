"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assign as assignAction,
  create as createAction,
  findById,
  resolve as resolveAction,
} from "@/lib/actions";
import { record } from "@/lib/audit";
import { requireAdmin, requireUser } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { saveImage } from "@/lib/uploads";

const CreateSchema = z.object({
  incidentId: z.string().optional().nullable(),
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().max(2000).optional().nullable(),
  assigneeId: z.string().min(1, "Assignee required"),
  deadline: z.string().min(1, "Deadline required"),
});

export async function createActionAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const rawIncident = formData.get("incidentId");
  const parsed = CreateSchema.safeParse({
    incidentId: typeof rawIncident === "string" && rawIncident.length > 0 ? rawIncident : null,
    title: formData.get("title"),
    description: formData.get("description"),
    assigneeId: formData.get("assigneeId"),
    deadline: formData.get("deadline"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const deadline = new Date(parsed.data.deadline);
  if (isNaN(deadline.getTime())) return { error: "Invalid deadline." };

  const created = await createAction({
    incidentId: parsed.data.incidentId ?? null,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    assigneeId: parsed.data.assigneeId,
    deadline,
    createdBy: admin.id,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "action.create",
    entity: { type: "corrective_action", id: created.id },
    after: {
      title: created.title,
      assigneeId: created.assigneeId,
      deadline: created.deadline.toISOString(),
      incidentId: created.incidentId,
    },
    request: meta,
  });

  revalidatePath("/admin/actions");
  if (created.incidentId) revalidatePath(`/admin/incidents/${created.incidentId}`);
  return { ok: true, id: created.id };
}

const AssignSchema = z.object({
  id: z.string().min(1),
  assigneeId: z.string().min(1),
});

export async function assignActionAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const parsed = AssignSchema.safeParse({
    id: formData.get("id"),
    assigneeId: formData.get("assigneeId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const before = await findById(parsed.data.id);
  if (!before) return { error: "Action not found." };

  const updated = await assignAction(parsed.data.id, parsed.data.assigneeId);
  if (!updated) return { error: "Update failed." };

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "action.assign",
    entity: { type: "corrective_action", id: parsed.data.id },
    before: { assigneeId: before.assigneeId },
    after: { assigneeId: updated.assigneeId },
    request: meta,
  });

  revalidatePath("/admin/actions");
  return { ok: true };
}

const ResolveSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(2000).optional().nullable(),
});

export async function resolveActionAction(formData: FormData) {
  const user = await requireUser();
  const meta = await getRequestMeta();

  const parsed = ResolveSchema.safeParse({
    id: formData.get("id"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await findById(parsed.data.id);
  if (!existing) return { error: "Action not found." };

  const isOwner = existing.assigneeId === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) return { error: "Not authorised." };
  if (existing.status === "resolved") return { error: "Already resolved." };

  let photoPath: string | null = null;
  const photoFile = formData.get("photo");
  if (photoFile instanceof File && photoFile.size > 0) {
    try {
      photoPath = await saveImage("action-resolution", photoFile);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Photo upload failed." };
    }
  }

  const updated = await resolveAction(parsed.data.id, user.id, parsed.data.note ?? null, photoPath);
  if (!updated) return { error: "Update failed." };

  await record({
    actor: { id: user.id, email: user.email },
    action: "action.resolve",
    entity: { type: "corrective_action", id: parsed.data.id },
    before: { status: existing.status },
    after: { status: updated.status, resolutionNote: updated.resolutionNote, hasPhoto: !!photoPath },
    request: meta,
  });

  revalidatePath("/actions/mine");
  revalidatePath("/admin/actions");
  return { ok: true };
}
