"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { saveFile } from "@/lib/uploads";

const DOC_FILE_MAX = 25 * 1024 * 1024;

const JobContractSchema = z.object({
  principalName: z.string().max(200).optional().or(z.literal("")),
  principalTradingAs: z.string().max(200).optional().or(z.literal("")),
  principalRepName: z.string().max(200).optional().or(z.literal("")),
  principalRepPhone: z.string().max(50).optional().or(z.literal("")),
  principalRepEmail: z.string().email().optional().or(z.literal("")),
  contractDateForPc: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  contractSumDollars: z.coerce.number().min(0).optional(),
  dayBasis: z.enum(["ordinary", "working"]).optional().or(z.literal("")),
});

export async function updateJobContractAction(jobId: string, formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const obj: Record<string, unknown> = {};
  for (const key of [
    "principalName", "principalTradingAs", "principalRepName",
    "principalRepPhone", "principalRepEmail", "contractDateForPc", "dayBasis",
  ]) {
    obj[key] = formData.get(key) ?? "";
  }
  const sum = formData.get("contractSumDollars");
  if (sum != null && sum !== "") obj.contractSumDollars = sum;
  const parsed = JobContractSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const f = parsed.data;

  const { updateJobContract } = await import("@/lib/jobs");
  await updateJobContract(jobId, {
    principalName: f.principalName || null,
    principalTradingAs: f.principalTradingAs || null,
    principalRepName: f.principalRepName || null,
    principalRepPhone: f.principalRepPhone || null,
    principalRepEmail: f.principalRepEmail || null,
    contractDateForPc: f.contractDateForPc || null,
    contractSumCents: f.contractSumDollars != null ? Math.round(f.contractSumDollars * 100) : null,
    dayBasis: f.dayBasis || null,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "job.contract.update",
    entity: { type: "job", id: jobId },
    request: meta,
  });
  revalidatePath(`/contractflow/${jobId}`);
  return { ok: true as const };
}

const CONTRACT_SRC_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const CONTRACT_SRC_KINDS = new Set(["loa", "po", "sr_rep", "conditions"]);

export async function uploadJobContractFileAction(jobId: string, formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const kind = String(formData.get("kind") ?? "");
  if (!CONTRACT_SRC_KINDS.has(kind)) return { error: "Unknown document kind." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const { findJobById, addJobContractFile } = await import("@/lib/jobs");
  const job = await findJobById(jobId);
  if (!job) return { error: "Job not found." };
  try {
    const saved = await saveFile(`job-contract-files/${jobId}`, file, {
      allowedExt: CONTRACT_SRC_EXT,
      maxBytes: DOC_FILE_MAX,
    });
    await addJobContractFile({
      jobId,
      kind: kind as "loa" | "po" | "sr_rep" | "conditions",
      path: saved.path,
      originalFilename: saved.originalFilename,
      uploadedBy: admin.id,
    });
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "job.contract_file.add",
      entity: { type: "job", id: jobId },
      after: { filename: saved.originalFilename, kind },
      request: meta,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }
  revalidatePath(`/contractflow/${jobId}`);
  return { ok: true as const };
}
