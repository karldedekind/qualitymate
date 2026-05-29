"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import {
  activateJob,
  createJob,
  deactivateJob,
  findJobById,
  findJobByNumber,
  updateJob,
} from "@/lib/jobs";

const CreateSchema = z.object({
  number: z.string().min(1, "Job number is required").max(50),
  name: z.string().min(1, "Job name is required").max(200),
  address: z.string().max(500).optional().or(z.literal("")),
});

export async function createJobAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = CreateSchema.safeParse({
    number: formData.get("number"),
    name: formData.get("name"),
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const dup = await findJobByNumber(parsed.data.number);
  if (dup) return { error: `Job number ${parsed.data.number} already exists.` };

  const created = await createJob({
    number: parsed.data.number,
    name: parsed.data.name,
    address: parsed.data.address || null,
    createdBy: admin.id,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "job.create",
    entity: { type: "job", id: created.id },
    after: { number: created.number, name: created.name, address: created.address },
    request: meta,
  });

  revalidatePath("/admin/jobs");
  redirect("/admin/jobs");
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().or(z.literal("")),
  active: z.string().optional(),
});

export async function updateJobAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = UpdateSchema.safeParse({
    id: formData.get("id"),
    number: formData.get("number"),
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    active: formData.get("active") ?? undefined,
  });
  if (!parsed.success) return { error: "Invalid input" };

  const before = await findJobById(parsed.data.id);
  if (!before) return { error: "Job not found" };

  if (parsed.data.number !== before.number) {
    const dup = await findJobByNumber(parsed.data.number);
    if (dup) return { error: `Job number ${parsed.data.number} already exists.` };
  }

  const after = await updateJob(parsed.data.id, {
    number: parsed.data.number,
    name: parsed.data.name,
    address: parsed.data.address || null,
    active: parsed.data.active === "on",
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "job.update",
    entity: { type: "job", id: parsed.data.id },
    before: { number: before.number, name: before.name, address: before.address, active: before.active },
    after: { number: after?.number, name: after?.name, address: after?.address, active: after?.active },
    request: meta,
  });

  revalidatePath("/admin/jobs");
  redirect("/admin/jobs");
}

const IdSchema = z.object({ id: z.string().min(1) });

export async function deactivateJobAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const before = await findJobById(parsed.data.id);
  if (!before) return { error: "Job not found" };

  await deactivateJob(parsed.data.id);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "job.deactivate",
    entity: { type: "job", id: parsed.data.id },
    before: { active: before.active },
    after: { active: false, number: before.number, name: before.name },
    request: meta,
  });
  revalidatePath("/admin/jobs");
  return { ok: true };
}

export async function activateJobAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const before = await findJobById(parsed.data.id);
  if (!before) return { error: "Job not found" };

  await activateJob(parsed.data.id);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "job.activate",
    entity: { type: "job", id: parsed.data.id },
    before: { active: before.active },
    after: { active: true, number: before.number, name: before.name },
    request: meta,
  });
  revalidatePath("/admin/jobs");
  return { ok: true };
}
