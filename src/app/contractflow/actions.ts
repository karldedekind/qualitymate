"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireCapability } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { saveFile } from "@/lib/uploads";

const DOC_FILE_MAX = 25 * 1024 * 1024;
const DOC_FILE_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".eml", ".msg", ".xlsx", ".docx"]);
// PNG/JPEG only: photos are embedded into the issued PDF and pdfkit cannot render WebP.
const DOC_PHOTO_EXT = new Set([".png", ".jpg", ".jpeg"]);

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
  variationId: z.string().optional().or(z.literal("")),
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
    "request", "responseRequiredBy", "adjustedPcDate", "rfiId", "nodId", "variationId",
  ]) {
    const v = formData.get(key);
    if (v != null && v !== "") obj[key] = v;
  }
  const days = formData.get("daysClaimed");
  if (days != null && days !== "") obj.daysClaimed = days;
  return DraftFieldsSchema.safeParse(obj);
}

/** Files posted alongside a new draft, validated before the draft is created. */
function draftUploads(formData: FormData) {
  const entries: { file: File; role: "photo" | "attachment" }[] = [];
  for (const [field, role] of [["photos", "photo"], ["documents", "attachment"]] as const) {
    for (const v of formData.getAll(field)) {
      if (!(v instanceof File) || v.size === 0) continue;
      const ext = v.name.slice(v.name.lastIndexOf(".")).toLowerCase();
      const allowed = role === "photo" ? DOC_PHOTO_EXT : DOC_FILE_EXT;
      if (!allowed.has(ext)) {
        return { error: `${v.name}: unsupported ${role === "photo" ? "photo" : "document"} type.` };
      }
      if (v.size > DOC_FILE_MAX) {
        return { error: `${v.name}: too large. Max ${Math.round(DOC_FILE_MAX / 1024 / 1024)} MB.` };
      }
      entries.push({ file: v, role });
    }
  }
  return { entries };
}

export async function createDraftAction(jobId: string, kind: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const parsedKind = KindSchema.safeParse(kind);
  if (!parsedKind.success) return { error: "Unknown document kind." };
  const parsed = draftFields(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const f = parsed.data;

  const uploads = draftUploads(formData);
  if ("error" in uploads) return { error: uploads.error };

  let eotDefaults: Partial<Awaited<ReturnType<typeof eotFields>>> = {};
  if (parsedKind.data === "eot") {
    try {
      eotDefaults = await eotFields(jobId, f);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not compute EOT dates." };
    }
  }

  const { createDraft, addDocFile } = await import("@/lib/contract-documents");
  const doc = await createDraft({
    jobId,
    kind: parsedKind.data,
    createdBy: admin.id,
    content: contentFrom(parsedKind.data, f),
    responseRequiredBy: f.responseRequiredBy || null,
    daysClaimed: f.daysClaimed ?? null,
    rfiId: f.rfiId || null,
    nodId: f.nodId || null,
    variationId: f.variationId || null,
    ...eotDefaults,
  });

  for (const { file, role } of uploads.entries) {
    const saved = await saveFile(`contract-files/${doc.id}`, file, {
      allowedExt: role === "photo" ? DOC_PHOTO_EXT : DOC_FILE_EXT,
      maxBytes: DOC_FILE_MAX,
    });
    await addDocFile({
      documentId: doc.id,
      role,
      path: saved.path,
      originalFilename: saved.originalFilename,
      uploadedBy: admin.id,
    });
  }

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
  const admin = await requireCapability("contractflow.manage");
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
      variationId: f.variationId || null,
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
  const admin = await requireCapability("contractflow.manage");
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
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const { issueAndDistribute } = await import("@/lib/contract-issue");
  try {
    const outcome = await issueAndDistribute(documentId, admin.id);
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "contract_doc.issue",
      entity: { type: "contract_document", id: documentId },
      after: {
        number: outcome.doc.number,
        version: outcome.doc.currentVersion,
        emailSent: outcome.emailSent,
        emailError: outcome.emailError,
      },
      request: meta,
    });
    revalidatePath(`/contractflow/${outcome.doc.jobId}`);
    return {
      ok: true as const,
      emailSent: outcome.emailSent,
      emailError: outcome.emailError,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Issue failed." };
  }
}

export async function startRevisionAction(documentId: string) {
  const admin = await requireCapability("contractflow.manage");
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

const ResponseSchema = z.object({
  status: z.enum(["answered", "approved", "rejected", "acknowledged"]),
  note: z.string().max(2000).optional().or(z.literal("")),
});

export async function recordResponseAction(documentId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const parsed = ResponseSchema.safeParse({
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { recordResponse, addDocFile, findById } = await import("@/lib/contract-documents");
  const doc = await findById(documentId);
  if (!doc) return { error: "Document not found." };

  const file = formData.get("file");
  try {
    if (file instanceof File && file.size > 0) {
      const saved = await saveFile(`contract-files/${documentId}`, file, {
        allowedExt: DOC_FILE_EXT,
        maxBytes: DOC_FILE_MAX,
      });
      await addDocFile({
        documentId,
        role: "response",
        path: saved.path,
        originalFilename: saved.originalFilename,
        uploadedBy: admin.id,
      });
    }
    await recordResponse(documentId, {
      status: parsed.data.status,
      respondedBy: admin.id,
      note: parsed.data.note || null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Recording response failed." };
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "contract_doc.response",
    entity: { type: "contract_document", id: documentId },
    after: { status: parsed.data.status },
    request: meta,
  });
  revalidatePath(`/contractflow/${doc.jobId}/doc/${documentId}`);
  return { ok: true as const };
}

export async function withdrawAction(documentId: string) {
  const admin = await requireCapability("contractflow.manage");
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

export async function uploadAttachmentAction(documentId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const { findById, addDocFile } = await import("@/lib/contract-documents");
  const doc = await findById(documentId);
  if (!doc) return { error: "Document not found." };
  if (doc.status !== "draft") return { error: "Attachments are added while the document is a draft." };
  const role = formData.get("role") === "photo" ? ("photo" as const) : ("attachment" as const);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  try {
    const saved = await saveFile(`contract-files/${documentId}`, file, {
      allowedExt: role === "photo" ? DOC_PHOTO_EXT : DOC_FILE_EXT,
      maxBytes: DOC_FILE_MAX,
    });
    await addDocFile({
      documentId,
      role,
      path: saved.path,
      originalFilename: saved.originalFilename,
      uploadedBy: admin.id,
    });
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "contract_doc.attachment.add",
      entity: { type: "contract_document", id: documentId },
      after: { filename: saved.originalFilename, role },
      request: meta,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }
  revalidatePath(`/contractflow/${doc.jobId}/doc/${documentId}`);
  return { ok: true as const };
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
  const admin = await requireCapability("contractflow.manage");
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
  const admin = await requireCapability("contractflow.manage");
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

export async function extractJobContractAction(jobId: string) {
  await requireCapability("contractflow.manage");
  const { readFile } = await import("node:fs/promises");
  const { join, extname } = await import("node:path");
  const { findJobById, listJobContractFiles } = await import("@/lib/jobs");
  const { uploadsRoot } = await import("@/lib/uploads");
  const { extractContractDetails } = await import("@/lib/ai");

  const job = await findJobById(jobId);
  if (!job) return { error: "Job not found." };
  const files = await listJobContractFiles(jobId);
  if (files.length === 0) {
    return { error: "Upload the LOA, PO or representative document first." };
  }

  const MEDIA: Record<string, "application/pdf" | "image/png" | "image/jpeg"> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  const docs = [];
  for (const f of files) {
    const mediaType = MEDIA[extname(f.path).toLowerCase()];
    if (!mediaType) continue;
    try {
      const bytes = await readFile(join(uploadsRoot(), f.path));
      docs.push({ filename: f.originalFilename, mediaType, base64: bytes.toString("base64") });
    } catch {
      // Missing file on disk: skip rather than fail the whole extraction.
    }
  }
  if (docs.length === 0) return { error: "None of the uploaded documents could be read." };

  const result = await extractContractDetails(docs);
  if (!result.ok) return { error: result.error };
  return { extract: result.draft };
}

export async function linkVariationAction(documentId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const { findById, linkVariation } = await import("@/lib/contract-documents");
  const doc = await findById(documentId);
  if (!doc) return { error: "Document not found." };
  const raw = formData.get("variationId");
  const variationId = typeof raw === "string" && raw !== "" ? raw : null;
  if (variationId) {
    const { findVariationById } = await import("@/lib/variations");
    const v = await findVariationById(variationId);
    if (!v || v.jobId !== doc.jobId) return { error: "Variation not found on this job." };
  }
  await linkVariation(documentId, variationId);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "contract_doc.link_variation",
    entity: { type: "contract_document", id: documentId },
    after: { variationId },
    request: meta,
  });
  revalidatePath(`/contractflow/${doc.jobId}/doc/${documentId}`);
  return { ok: true as const };
}

// --- Variations ---

const VariationSchema = z.object({
  description: z.string().min(1, "Description is required").max(5000),
  number: z.coerce.number().int().min(1).optional(),
  claimedValueDollars: z.coerce.number().optional(),
  timeImpactDays: z.coerce.number().int().optional(),
});

export async function createVariationAction(jobId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const obj: Record<string, unknown> = { description: formData.get("description") };
  for (const key of ["number", "claimedValueDollars", "timeImpactDays"] as const) {
    const raw = formData.get(key);
    if (raw != null && raw !== "") obj[key] = raw;
  }
  const parsed = VariationSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!DOC_FILE_EXT.has(ext)) return { error: `${file.name}: unsupported file type.` };
    if (file.size > DOC_FILE_MAX) {
      return { error: `${file.name}: too large. Max ${Math.round(DOC_FILE_MAX / 1024 / 1024)} MB.` };
    }
  }

  const { createVariation, addVariationFile } = await import("@/lib/variations");
  let v;
  try {
    v = await createVariation({
      jobId,
      description: parsed.data.description,
      number: parsed.data.number ?? null,
      claimedValueCents:
        parsed.data.claimedValueDollars != null
          ? Math.round(parsed.data.claimedValueDollars * 100)
          : null,
      timeImpactDays: parsed.data.timeImpactDays ?? null,
      createdBy: admin.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the variation." };
  }

  if (file instanceof File && file.size > 0) {
    try {
      const saved = await saveFile(`variation-files/${v.id}`, file, {
        allowedExt: DOC_FILE_EXT,
        maxBytes: DOC_FILE_MAX,
      });
      await addVariationFile({
        variationId: v.id,
        path: saved.path,
        originalFilename: saved.originalFilename,
        uploadedBy: admin.id,
      });
    } catch {
      // Variation is created; a failed attachment can be re-added from the row.
    }
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "variation.create",
    entity: { type: "variation", id: v.id },
    after: { jobId, number: v.number },
    request: meta,
  });
  revalidatePath(`/contractflow/${jobId}`);
  return { ok: true as const };
}

/**
 * AI-extract variation details from a document selected in the create form.
 * The file is read in-memory only — nothing is stored and nothing is saved
 * until the user reviews the populated fields and adds the variation.
 */
export async function extractVariationDetailsAction(formData: FormData) {
  await requireCapability("contractflow.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const MEDIA: Record<string, "application/pdf" | "image/png" | "image/jpeg"> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const mediaType = MEDIA[ext];
  if (!mediaType) return { error: "AI can read PDF, PNG or JPG variation documents only." };
  if (file.size > DOC_FILE_MAX) {
    return { error: `${file.name}: too large. Max ${Math.round(DOC_FILE_MAX / 1024 / 1024)} MB.` };
  }
  const { extractVariationDetails } = await import("@/lib/ai");
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await extractVariationDetails([{ filename: file.name, mediaType, base64 }]);
  if (!result.ok) return { error: result.error };
  return { extract: result.draft };
}

export type BatchVariationResult = {
  filename: string;
  ok: boolean;
  /** Register number assigned to the created variation. */
  number?: number;
  description?: string;
  error?: string;
};

const BATCH_VARIATION_MAX_FILES = 20;

/**
 * Batch upload: one variation document per file. Each file is AI-read, a
 * variation is created from the extracted details (falling back to the
 * filename as description), and the source document is attached to it.
 * Created variations start as "proposed" so each can be reviewed, edited or
 * deleted from the register afterwards. Files are processed independently —
 * one bad file never blocks the rest.
 */
export async function batchCreateVariationsAction(jobId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one file." };
  if (files.length > BATCH_VARIATION_MAX_FILES) {
    return { error: `Too many files. Max ${BATCH_VARIATION_MAX_FILES} per batch.` };
  }

  const MEDIA: Record<string, "application/pdf" | "image/png" | "image/jpeg"> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };

  const { extractVariationDetails } = await import("@/lib/ai");
  const { createVariation, addVariationFile } = await import("@/lib/variations");

  const results: BatchVariationResult[] = [];
  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const mediaType = MEDIA[ext];
    if (!mediaType) {
      results.push({
        filename: file.name,
        ok: false,
        error: "AI can read PDF, PNG or JPG variation documents only.",
      });
      continue;
    }
    if (file.size > DOC_FILE_MAX) {
      results.push({
        filename: file.name,
        ok: false,
        error: `Too large. Max ${Math.round(DOC_FILE_MAX / 1024 / 1024)} MB.`,
      });
      continue;
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const extracted = await extractVariationDetails([{ filename: file.name, mediaType, base64 }]);
    if (!extracted.ok) {
      results.push({ filename: file.name, ok: false, error: extracted.error });
      continue;
    }
    const e = extracted.draft;

    const input = {
      jobId,
      description: e.description?.trim() || file.name,
      claimedValueCents:
        e.claimedValueDollars != null ? Math.round(e.claimedValueDollars * 100) : null,
      timeImpactDays: e.timeImpactDays ?? null,
      createdBy: admin.id,
    };
    let v;
    try {
      try {
        v = await createVariation({ ...input, number: e.number ?? null });
      } catch {
        // Extracted number already taken (or invalid) — fall back to the
        // next free number rather than failing the file.
        v = await createVariation({ ...input, number: null });
      }
    } catch (err) {
      results.push({
        filename: file.name,
        ok: false,
        error: err instanceof Error ? err.message : "Could not create the variation.",
      });
      continue;
    }

    try {
      const saved = await saveFile(`variation-files/${v.id}`, file, {
        allowedExt: DOC_FILE_EXT,
        maxBytes: DOC_FILE_MAX,
      });
      await addVariationFile({
        variationId: v.id,
        path: saved.path,
        originalFilename: saved.originalFilename,
        uploadedBy: admin.id,
      });
    } catch {
      // Variation is created; a failed attachment can be re-added from the row.
    }

    await record({
      actor: { id: admin.id, email: admin.email },
      action: "variation.create",
      entity: { type: "variation", id: v.id },
      after: { jobId, number: v.number, source: "batch-ai" },
      request: meta,
    });
    results.push({
      filename: file.name,
      ok: true,
      number: v.number,
      description: v.description,
    });
  }

  revalidatePath(`/contractflow/${jobId}`);
  return { results };
}

const VariationStatusSchema = z.object({
  status: z.enum(["proposed", "submitted", "approved", "rejected", "deleted"]),
  approvedValueDollars: z.coerce.number().optional(),
});

export async function setVariationStatusAction(variationId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const obj: Record<string, unknown> = { status: formData.get("status") };
  const approvedRaw = formData.get("approvedValueDollars");
  if (approvedRaw != null && approvedRaw !== "") obj.approvedValueDollars = approvedRaw;
  const parsed = VariationStatusSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const status = parsed.data.status;
  const { findVariationById, updateVariation, decideVariation, deleteVariation } = await import(
    "@/lib/variations"
  );
  const v = await findVariationById(variationId);
  if (!v) return { error: "Variation not found." };

  try {
    if (status === "submitted" || status === "proposed") {
      await updateVariation(variationId, { status });
    } else if (status === "approved" || status === "rejected") {
      await decideVariation(variationId, {
        status,
        approvedValueCents:
          parsed.data.approvedValueDollars != null
            ? Math.round(parsed.data.approvedValueDollars * 100)
            : undefined,
      });
    } else {
      await deleteVariation(variationId);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed." };
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: `variation.${status === "deleted" ? "delete" : status}`,
    entity: { type: "variation", id: variationId },
    request: meta,
  });
  revalidatePath(`/contractflow/${v.jobId}`);
  return { ok: true as const };
}

export async function uploadVariationFileAction(variationId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const { findVariationById, addVariationFile } = await import("@/lib/variations");
  const v = await findVariationById(variationId);
  if (!v) return { error: "Variation not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  try {
    const saved = await saveFile(`variation-files/${variationId}`, file, {
      allowedExt: DOC_FILE_EXT,
      maxBytes: DOC_FILE_MAX,
    });
    await addVariationFile({
      variationId,
      path: saved.path,
      originalFilename: saved.originalFilename,
      uploadedBy: admin.id,
    });
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "variation.file.add",
      entity: { type: "variation", id: variationId },
      after: { filename: saved.originalFilename },
      request: meta,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }
  revalidatePath(`/contractflow/${v.jobId}`);
  return { ok: true as const };
}

// --- Communications ---

const CommSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(500),
  direction: z.enum(["inbound", "outbound"]),
  occurredAt: z.string().min(1, "Date is required"),
  note: z.string().max(2000).optional().or(z.literal("")),
  documentId: z.string().optional().or(z.literal("")),
});

export async function extractCommunicationDetailsAction(jobId: string, formData: FormData) {
  await requireCapability("contractflow.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (!file.name.toLowerCase().endsWith(".eml")) {
    return { error: "AI populate works with .eml email files." };
  }
  if (file.size > DOC_FILE_MAX) {
    return { error: `${file.name}: too large. Max ${Math.round(DOC_FILE_MAX / 1024 / 1024)} MB.` };
  }

  const { findJobById } = await import("@/lib/jobs");
  const { listForJob, documentTitle } = await import("@/lib/contract-documents");
  const { KNOWN_KEYS, get } = await import("@/lib/settings");
  const { extractCommunicationDetails } = await import("@/lib/ai");

  const job = await findJobById(jobId);
  if (!job) return { error: "Job not found." };
  const [docs, contractorEmail] = await Promise.all([
    listForJob(jobId),
    get(KNOWN_KEYS.CONTRACTOR_EMAIL),
  ]);

  // Cap the raw MIME text; big base64 attachment bodies add nothing for extraction.
  const emailText = (await file.text()).slice(0, 60_000);
  const result = await extractCommunicationDetails({
    emailText,
    contractorEmail: contractorEmail ?? null,
    principalRepEmail: job.principalRepEmail,
    documents: docs
      .filter((d) => d.number != null)
      .map((d) => ({ id: d.id, label: documentTitle(d) })),
  });
  if (!result.ok) return { error: result.error };
  return { extract: result.draft };
}

export async function logCommunicationAction(jobId: string, formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const parsed = CommSchema.safeParse({
    subject: formData.get("subject"),
    direction: formData.get("direction"),
    occurredAt: formData.get("occurredAt"),
    note: formData.get("note") ?? "",
    documentId: formData.get("documentId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const occurred = new Date(parsed.data.occurredAt);
  if (Number.isNaN(occurred.getTime())) return { error: "Invalid date." };

  let path: string | null = null;
  let originalFilename: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      const saved = await saveFile(`communications/${jobId}`, file, {
        allowedExt: DOC_FILE_EXT,
        maxBytes: DOC_FILE_MAX,
      });
      path = saved.path;
      originalFilename = saved.originalFilename;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Upload failed." };
    }
  }

  const { logCommunication } = await import("@/lib/communications");
  const comm = await logCommunication({
    jobId,
    direction: parsed.data.direction,
    subject: parsed.data.subject,
    occurredAt: occurred,
    path,
    originalFilename,
    note: parsed.data.note || null,
    documentId: parsed.data.documentId || null,
    createdBy: admin.id,
  });
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "communication.log",
    entity: { type: "communication", id: comm.id },
    after: { jobId, subject: comm.subject },
    request: meta,
  });
  revalidatePath(`/contractflow/${jobId}`);
  if (comm.documentId) {
    revalidatePath(`/contractflow/${jobId}/doc/${comm.documentId}`);
  }
  return { ok: true as const };
}

// --- Signature ---

export async function saveSignatureAction(formData: FormData) {
  const admin = await requireCapability("contractflow.manage");
  const meta = await getRequestMeta();
  const dataUrl = String(formData.get("signature") ?? "");
  const { saveUserSignature } = await import("@/lib/contract-issue");
  try {
    await saveUserSignature(admin.id, dataUrl);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Saving signature failed." };
  }
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "user.signature.update",
    entity: { type: "user", id: admin.id },
    request: meta,
  });
  revalidatePath("/contractflow/signature");
  return { ok: true as const };
}

const RewriteRequestSchema = z.object({
  docKind: z.string().min(1).max(100),
  fieldLabel: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
});

export async function suggestRewriteAction(input: {
  docKind: string;
  fieldLabel: string;
  text: string;
}) {
  await requireCapability("contractflow.manage");
  const parsed = RewriteRequestSchema.safeParse({ ...input, text: input.text.trim() });
  if (!parsed.success) return { error: "Write some text first." };
  const { isConfigured, rewriteContractField } = await import("@/lib/ai");
  if (!(await isConfigured())) {
    return { error: "AI not configured. Add an Anthropic key in Settings." };
  }
  const result = await rewriteContractField(parsed.data);
  if (!result.ok) return { error: result.error };
  return { rewrite: result.draft.rewrite };
}
