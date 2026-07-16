"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { saveFile } from "@/lib/uploads";

const DOC_FILE_MAX = 25 * 1024 * 1024;

const KindSchema = z.enum(["rfi", "nod", "eot"]);

const DraftFieldsSchema = z.object({
  question: z.string().max(20_000).optional(),
  cause: z.string().max(20_000).optional(),
  datesOccurred: z.string().max(20_000).optional(),
  daysDelayed: z.string().max(2_000).optional(),
  clausePreamble: z.string().max(20_000).optional(),
  reasons: z.string().max(20_000).optional(),
  request: z.string().max(20_000).optional(),
  responseRequiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  daysClaimed: z.coerce.number().int().min(0).optional(),
  adjustedPcDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  rfiId: z.string().optional().or(z.literal("")),
  nodId: z.string().optional().or(z.literal("")),
});

function contentFrom(kind: z.infer<typeof KindSchema>, f: z.infer<typeof DraftFieldsSchema>) {
  if (kind === "rfi") return { question: f.question ?? "" };
  if (kind === "nod")
    return { cause: f.cause ?? "", datesOccurred: f.datesOccurred ?? "", daysDelayed: f.daysDelayed ?? "" };
  return { clausePreamble: f.clausePreamble ?? "", reasons: f.reasons ?? "", request: f.request ?? "" };
}

/**
 * EOT base figures: computed from the job's approved EOTs when days are
 * claimed; a manually-entered adjusted date always wins (override).
 */
async function eotFields(jobId: string, f: z.infer<typeof DraftFieldsSchema>) {
  if (f.daysClaimed == null) {
    return { adjustedPcDate: f.adjustedPcDate || null };
  }
  const { computeEotDefaults } = await import("@/lib/contract-documents");
  const defaults = await computeEotDefaults(jobId, f.daysClaimed);
  return f.adjustedPcDate ? { ...defaults, adjustedPcDate: f.adjustedPcDate } : defaults;
}

function draftFields(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const key of [
    "question", "cause", "datesOccurred", "daysDelayed", "clausePreamble", "reasons",
    "request", "responseRequiredBy", "adjustedPcDate", "rfiId", "nodId",
  ]) {
    const v = formData.get(key);
    if (v != null && v !== "") obj[key] = v;
  }
  const days = formData.get("daysClaimed");
  if (days != null && days !== "") obj.daysClaimed = days;
  return DraftFieldsSchema.safeParse(obj);
}

export async function createDraftAction(jobId: string, kind: string, formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsedKind = KindSchema.safeParse(kind);
  if (!parsedKind.success) return { error: "Unknown document kind." };
  const parsed = draftFields(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const f = parsed.data;

  let eotDefaults: Partial<Awaited<ReturnType<typeof eotFields>>> = {};
  if (parsedKind.data === "eot") {
    try {
      eotDefaults = await eotFields(jobId, f);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not compute EOT dates." };
    }
  }

  const { createDraft } = await import("@/lib/contract-documents");
  const doc = await createDraft({
    jobId,
    kind: parsedKind.data,
    createdBy: admin.id,
    content: contentFrom(parsedKind.data, f),
    responseRequiredBy: f.responseRequiredBy || null,
    daysClaimed: f.daysClaimed ?? null,
    rfiId: f.rfiId || null,
    nodId: f.nodId || null,
    ...eotDefaults,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "contract_doc.draft.create",
    entity: { type: "contract_document", id: doc.id },
    after: { jobId, kind: doc.kind },
    request: meta,
  });
  revalidatePath(`/contractflow/${jobId}`);
  redirect(`/contractflow/${jobId}/doc/${doc.id}`);
}

export async function updateDraftAction(documentId: string, formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const { findById, updateDraft } = await import("@/lib/contract-documents");
  const doc = await findById(documentId);
  if (!doc) return { error: "Document not found." };
  const parsed = draftFields(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const f = parsed.data;

  let eotPatch: Partial<Awaited<ReturnType<typeof eotFields>>> = {};
  if (doc.kind === "eot") {
    try {
      eotPatch = await eotFields(doc.jobId, f);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not compute EOT dates." };
    }
  }

  try {
    await updateDraft(documentId, {
      content: contentFrom(doc.kind, f),
      responseRequiredBy: f.responseRequiredBy || null,
      daysClaimed: f.daysClaimed ?? null,
      rfiId: f.rfiId || null,
      nodId: f.nodId || null,
      ...eotPatch,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed." };
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "contract_doc.draft.update",
    entity: { type: "contract_document", id: documentId },
    request: meta,
  });
  revalidatePath(`/contractflow/${doc.jobId}`);
  redirect(`/contractflow/${doc.jobId}/doc/${documentId}`);
}

export async function deleteDraftAction(documentId: string) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const { findById, deleteDraft } = await import("@/lib/contract-documents");
  const doc = await findById(documentId);
  if (!doc) return { error: "Document not found." };
  try {
    await deleteDraft(documentId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Delete failed." };
  }
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "contract_doc.draft.delete",
    entity: { type: "contract_document", id: documentId },
    before: { jobId: doc.jobId, kind: doc.kind },
    request: meta,
  });
  revalidatePath(`/contractflow/${doc.jobId}`);
  redirect(`/contractflow/${doc.jobId}`);
}

export async function issueAction(documentId: string) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const { issue } = await import("@/lib/contract-documents");
  const { renderContractDocPdf } = await import("@/lib/contract-docs-pdf");
  try {
    const doc = await issue(documentId, admin.id, (d) => renderContractDocPdf(d, admin.id));
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "contract_doc.issue",
      entity: { type: "contract_document", id: documentId },
      after: { number: doc.number, version: doc.currentVersion },
      request: meta,
    });
    revalidatePath(`/contractflow/${doc.jobId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Issue failed." };
  }
}

export async function startRevisionAction(documentId: string) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const { startRevision } = await import("@/lib/contract-documents");
  try {
    const doc = await startRevision(documentId);
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "contract_doc.revise",
      entity: { type: "contract_document", id: documentId },
      request: meta,
    });
    revalidatePath(`/contractflow/${doc.jobId}/doc/${documentId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Revision failed." };
  }
}

export async function withdrawAction(documentId: string) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const { withdraw } = await import("@/lib/contract-documents");
  try {
    const doc = await withdraw(documentId);
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "contract_doc.withdraw",
      entity: { type: "contract_document", id: documentId },
      request: meta,
    });
    revalidatePath(`/contractflow/${doc.jobId}/doc/${documentId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Withdraw failed." };
  }
}

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
