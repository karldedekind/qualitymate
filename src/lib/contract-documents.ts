import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type ContractDocContent,
  contractDocFiles,
  contractDocVersions,
  contractDocuments,
  jobs,
} from "@/db/schema";
import { saveBytes } from "@/lib/uploads";
import { addOrdinaryDays, addWorkingDays } from "@/lib/working-days";

export type ContractDocument = typeof contractDocuments.$inferSelect;
export type ContractDocVersion = typeof contractDocVersions.$inferSelect;
export type ContractDocFile = typeof contractDocFiles.$inferSelect;
export type ContractDocKind = ContractDocument["kind"];

function newId(): string {
  return randomBytes(12).toString("base64url");
}

const KIND_LABEL: Record<ContractDocKind, string> = {
  rfi: "RFI",
  nod: "NOD",
  eot: "EOT",
};

export function kindLabel(kind: ContractDocKind): string {
  return KIND_LABEL[kind];
}

export function documentTitle(doc: Pick<ContractDocument, "kind" | "number">): string {
  const num = doc.number != null ? String(doc.number).padStart(2, "0") : "draft";
  return `${KIND_LABEL[doc.kind]} ${num}`;
}

export type CreateDraftInput = {
  jobId: string;
  kind: ContractDocKind;
  createdBy: string;
  content: ContractDocContent;
  responseRequiredBy?: string | null;
  daysClaimed?: number | null;
  pcDateSnapshot?: string | null;
  previousEotDays?: number | null;
  adjustedPcDate?: string | null;
  rfiId?: string | null;
  nodId?: string | null;
  variationId?: string | null;
};

export async function createDraft(input: CreateDraftInput): Promise<ContractDocument> {
  const [row] = await db
    .insert(contractDocuments)
    .values({
      id: newId(),
      jobId: input.jobId,
      kind: input.kind,
      content: input.content,
      responseRequiredBy: input.responseRequiredBy ?? null,
      daysClaimed: input.daysClaimed ?? null,
      pcDateSnapshot: input.pcDateSnapshot ?? null,
      previousEotDays: input.previousEotDays ?? null,
      adjustedPcDate: input.adjustedPcDate ?? null,
      rfiId: input.rfiId ?? null,
      nodId: input.nodId ?? null,
      variationId: input.variationId ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function findById(id: string): Promise<ContractDocument | null> {
  const rows = await db
    .select()
    .from(contractDocuments)
    .where(eq(contractDocuments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type UpdateDraftInput = Partial<
  Pick<
    CreateDraftInput,
    | "content"
    | "responseRequiredBy"
    | "daysClaimed"
    | "pcDateSnapshot"
    | "previousEotDays"
    | "adjustedPcDate"
    | "rfiId"
    | "nodId"
    | "variationId"
  >
>;

export async function updateDraft(
  id: string,
  input: UpdateDraftInput,
): Promise<ContractDocument | null> {
  const doc = await findById(id);
  if (!doc) return null;
  if (doc.status !== "draft") {
    throw new Error("Document is issued; start a revision to edit it.");
  }
  const patch: Partial<typeof contractDocuments.$inferInsert> = { updatedAt: new Date() };
  if (input.content !== undefined) patch.content = input.content;
  if (input.responseRequiredBy !== undefined) patch.responseRequiredBy = input.responseRequiredBy;
  if (input.daysClaimed !== undefined) patch.daysClaimed = input.daysClaimed;
  if (input.pcDateSnapshot !== undefined) patch.pcDateSnapshot = input.pcDateSnapshot;
  if (input.previousEotDays !== undefined) patch.previousEotDays = input.previousEotDays;
  if (input.adjustedPcDate !== undefined) patch.adjustedPcDate = input.adjustedPcDate;
  if (input.rfiId !== undefined) patch.rfiId = input.rfiId;
  if (input.nodId !== undefined) patch.nodId = input.nodId;
  if (input.variationId !== undefined) patch.variationId = input.variationId;
  const [row] = await db
    .update(contractDocuments)
    .set(patch)
    .where(eq(contractDocuments.id, id))
    .returning();
  return row ?? null;
}

/**
 * Set or clear a document's linked variation. Unlike draft fields this is
 * allowed at any status — variations are typically raised after the RFI has
 * already been issued. The printed PDF picks the link up on the next re-issue.
 */
export async function linkVariation(
  id: string,
  variationId: string | null,
): Promise<ContractDocument | null> {
  const [row] = await db
    .update(contractDocuments)
    .set({ variationId, updatedAt: new Date() })
    .where(eq(contractDocuments.id, id))
    .returning();
  return row ?? null;
}

export async function deleteDraft(id: string): Promise<void> {
  const doc = await findById(id);
  if (!doc) return;
  if (doc.currentVersion > 0) {
    throw new Error("Document has been issued and cannot be deleted.");
  }
  await db.delete(contractDocuments).where(eq(contractDocuments.id, id));
}

export type RenderPdf = (doc: ContractDocument) => Promise<Buffer>;

/**
 * Issue the current draft: allocate the next gap-free number for the job+kind
 * (first issue only), snapshot an immutable version, render + store the PDF,
 * and lock the document. Numbering is serialized by locking the job row.
 */
export async function issue(
  id: string,
  issuedBy: string,
  renderPdf: RenderPdf,
): Promise<ContractDocument> {
  return db.transaction(async (tx) => {
    const docRows = await tx
      .select()
      .from(contractDocuments)
      .where(eq(contractDocuments.id, id))
      .limit(1);
    const doc = docRows[0];
    if (!doc) throw new Error("Document not found.");
    if (doc.status !== "draft") {
      throw new Error("Only a draft can be issued; start a revision first.");
    }

    // Serialize number allocation per job.
    await tx.execute(sql`SELECT "id" FROM "jobs" WHERE "id" = ${doc.jobId} FOR UPDATE`);

    // An EOT's base figures are computed at draft time; refuse to issue if
    // another approved EOT has since made them stale — the printed claim
    // would misstate "previous claims". Editing the draft refreshes them.
    if (doc.kind === "eot" && doc.daysClaimed != null && doc.pcDateSnapshot != null) {
      const fresh = await computeEotDefaults(doc.jobId, doc.daysClaimed);
      if (
        fresh.previousEotDays !== (doc.previousEotDays ?? 0) ||
        fresh.pcDateSnapshot !== doc.pcDateSnapshot
      ) {
        throw new Error(
          "This EOT's base figures are out of date (another EOT was approved since drafting). Edit and re-save the draft to refresh them, then issue.",
        );
      }
    }

    let number = doc.number;
    if (number == null) {
      const res = await tx.execute<{ next: number }>(
        sql`SELECT COALESCE(MAX("number"), 0) + 1 AS next
            FROM "contract_documents"
            WHERE "job_id" = ${doc.jobId} AND "kind" = ${doc.kind}`,
      );
      number = Number(res[0]!.next);
    }
    const version = doc.currentVersion + 1;
    const now = new Date();

    const docForPdf: ContractDocument = { ...doc, number, currentVersion: version };
    const pdfBytes = await renderPdf(docForPdf);
    const pdfPath = `contract-docs/${doc.id}/${doc.kind}-${number}-v${version}.pdf`;
    await saveBytes(pdfPath, pdfBytes);

    await tx
      .update(contractDocVersions)
      .set({ supersededAt: now })
      .where(
        and(eq(contractDocVersions.documentId, doc.id), isNull(contractDocVersions.supersededAt)),
      );

    const snapshot = {
      jobId: doc.jobId,
      kind: doc.kind,
      number,
      content: doc.content,
      responseRequiredBy: doc.responseRequiredBy,
      daysClaimed: doc.daysClaimed,
      pcDateSnapshot: doc.pcDateSnapshot,
      previousEotDays: doc.previousEotDays,
      adjustedPcDate: doc.adjustedPcDate,
      rfiId: doc.rfiId,
      nodId: doc.nodId,
      variationId: doc.variationId,
    };
    await tx.insert(contractDocVersions).values({
      id: newId(),
      documentId: doc.id,
      version,
      snapshot,
      pdfPath,
      issuedAt: now,
      issuedBy,
    });

    const [updated] = await tx
      .update(contractDocuments)
      .set({
        number,
        status: "issued",
        currentVersion: version,
        respondedAt: null,
        respondedBy: null,
        responseNote: null,
        updatedAt: now,
      })
      .where(eq(contractDocuments.id, doc.id))
      .returning();
    return updated;
  });
}

/** Reopen an issued document for editing. Keeps the number; reissue archives the prior version. */
export async function startRevision(id: string): Promise<ContractDocument> {
  const doc = await findById(id);
  if (!doc) throw new Error("Document not found.");
  if (doc.status === "draft") throw new Error("Document is already a draft.");
  if (doc.currentVersion === 0) throw new Error("Document has never been issued.");
  const [row] = await db
    .update(contractDocuments)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(contractDocuments.id, id))
    .returning();
  return row;
}

const RESPONSE_STATUS_BY_KIND: Record<ContractDocKind, ReadonlySet<string>> = {
  rfi: new Set(["answered"]),
  nod: new Set(["acknowledged"]),
  eot: new Set(["approved", "rejected"]),
};

export type RecordResponseInput = {
  status: "answered" | "approved" | "rejected" | "acknowledged";
  respondedBy: string;
  note?: string | null;
};

export async function recordResponse(
  id: string,
  input: RecordResponseInput,
): Promise<ContractDocument> {
  const doc = await findById(id);
  if (!doc) throw new Error("Document not found.");
  if (doc.status !== "issued") {
    throw new Error("Only an issued document can receive a response.");
  }
  if (!RESPONSE_STATUS_BY_KIND[doc.kind].has(input.status)) {
    throw new Error(`A ${KIND_LABEL[doc.kind]} cannot be marked '${input.status}'.`);
  }
  const [row] = await db
    .update(contractDocuments)
    .set({
      status: input.status,
      respondedAt: new Date(),
      respondedBy: input.respondedBy,
      responseNote: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(contractDocuments.id, id))
    .returning();
  return row;
}

export async function withdraw(id: string): Promise<ContractDocument> {
  const doc = await findById(id);
  if (!doc) throw new Error("Document not found.");
  if (doc.status !== "issued") {
    throw new Error("Only an issued document can be withdrawn.");
  }
  const [row] = await db
    .update(contractDocuments)
    .set({ status: "withdrawn", withdrawnAt: new Date(), updatedAt: new Date() })
    .where(eq(contractDocuments.id, id))
    .returning();
  return row;
}

export async function listVersions(documentId: string): Promise<ContractDocVersion[]> {
  return db
    .select()
    .from(contractDocVersions)
    .where(eq(contractDocVersions.documentId, documentId))
    .orderBy(asc(contractDocVersions.version));
}

export type EotDefaults = {
  pcDateSnapshot: string;
  previousEotDays: number;
  adjustedPcDate: string;
};

/** Approved EOTs for a job: total days granted + the latest adjusted date. */
async function approvedEotSummary(
  jobId: string,
): Promise<{ totalDays: number; latestAdjustedDate: string | null }> {
  const approved = await db
    .select({
      daysClaimed: contractDocuments.daysClaimed,
      adjustedPcDate: contractDocuments.adjustedPcDate,
    })
    .from(contractDocuments)
    .where(
      and(
        eq(contractDocuments.jobId, jobId),
        eq(contractDocuments.kind, "eot"),
        eq(contractDocuments.status, "approved"),
      ),
    );
  return {
    totalDays: approved.reduce((sum, r) => sum + (r.daysClaimed ?? 0), 0),
    latestAdjustedDate:
      approved
        .map((r) => r.adjustedPcDate)
        .filter((d): d is string => d != null)
        .sort()
        .at(-1) ?? null,
  };
}

/**
 * Defaults for a new EOT claim: base date is the latest approved EOT's
 * adjusted date (or the contract Date for PC), previous days is the sum of
 * approved claims. The caller may override the computed adjusted date.
 */
export async function computeEotDefaults(
  jobId: string,
  daysClaimed: number,
): Promise<EotDefaults> {
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) throw new Error("Job not found.");
  if (!job.contractDateForPc) {
    throw new Error("Job has no contract Date for Practical Completion set.");
  }
  const { totalDays, latestAdjustedDate } = await approvedEotSummary(jobId);
  const base = latestAdjustedDate ?? job.contractDateForPc;
  // The job's contract sets the day basis; working days (QLD) is the default
  // when the contract details don't say.
  const adjustedPcDate =
    job.dayBasis === "ordinary"
      ? addOrdinaryDays(base, daysClaimed)
      : addWorkingDays(base, daysClaimed);
  return {
    pcDateSnapshot: job.contractDateForPc,
    previousEotDays: totalDays,
    adjustedPcDate,
  };
}

/** The job's current contractual completion date (approved EOTs applied). */
export async function currentAdjustedPcDate(jobId: string): Promise<string | null> {
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) return null;
  const { latestAdjustedDate } = await approvedEotSummary(jobId);
  return latestAdjustedDate ?? job.contractDateForPc;
}

export async function listForJob(jobId: string): Promise<ContractDocument[]> {
  return db
    .select()
    .from(contractDocuments)
    .where(eq(contractDocuments.jobId, jobId))
    .orderBy(
      asc(contractDocuments.kind),
      sql`"number" ASC NULLS LAST`,
      asc(contractDocuments.createdAt),
    );
}

export type OpenDocumentRow = ContractDocument & {
  jobNumber: string;
  jobName: string;
  overdue: boolean;
};

function isoDateAt(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Issued documents across all jobs, with overdue flag for RFIs past their response date. */
export async function listOpenAcrossJobs(now: Date = new Date()): Promise<OpenDocumentRow[]> {
  const today = isoDateAt(now);
  const rows = await db
    .select({
      doc: contractDocuments,
      jobNumber: jobs.number,
      jobName: jobs.name,
    })
    .from(contractDocuments)
    .innerJoin(jobs, eq(contractDocuments.jobId, jobs.id))
    .where(eq(contractDocuments.status, "issued"))
    .orderBy(desc(contractDocuments.updatedAt));
  return rows.map((r) => ({
    ...r.doc,
    jobNumber: r.jobNumber,
    jobName: r.jobName,
    overdue:
      r.doc.kind === "rfi" &&
      r.doc.responseRequiredBy != null &&
      r.doc.responseRequiredBy < today,
  }));
}

export type AddDocFileInput = {
  documentId: string;
  role: "attachment" | "response" | "photo";
  path: string;
  originalFilename: string;
  uploadedBy: string;
};

export async function addDocFile(input: AddDocFileInput): Promise<ContractDocFile> {
  const [row] = await db
    .insert(contractDocFiles)
    .values({ id: newId(), ...input })
    .returning();
  return row;
}

export async function listDocFiles(documentId: string): Promise<ContractDocFile[]> {
  return db
    .select()
    .from(contractDocFiles)
    .where(eq(contractDocFiles.documentId, documentId))
    .orderBy(asc(contractDocFiles.createdAt));
}

/** Issued RFIs past their response-required-by date, not yet notified. */
export async function overdueRfiScan(now: Date = new Date()): Promise<ContractDocument[]> {
  const today = isoDateAt(now);
  return db
    .select()
    .from(contractDocuments)
    .where(
      and(
        eq(contractDocuments.kind, "rfi"),
        eq(contractDocuments.status, "issued"),
        sql`"response_required_by" < ${today}`,
        isNull(contractDocuments.overdueNotifiedAt),
      ),
    )
    .orderBy(asc(contractDocuments.responseRequiredBy));
}

export type ContractDocScanResult = {
  overdueNotified: number;
  scanned: number;
};

/**
 * Notify every active admin about overdue RFI responses, once per document
 * (`overdue_notified_at` stamps delivery, mirroring corrective-action scans).
 */
export async function runContractDocScans(now: Date = new Date()): Promise<ContractDocScanResult> {
  const { send } = await import("@/lib/notify");
  const { user } = await import("@/db/schema");
  const overdue = await overdueRfiScan(now);
  if (overdue.length === 0) return { overdueNotified: 0, scanned: 0 };

  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), isNull(user.deactivatedAt)));

  let notified = 0;
  for (const doc of overdue) {
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, doc.jobId)).limit(1);
    const job = jobRows[0];
    const title = documentTitle(doc);
    const body = `${title} on ${job?.number ?? "?"} - ${job?.name ?? "?"} has passed its response-required-by date (${doc.responseRequiredBy}).`;
    for (const admin of admins) {
      await send({
        userId: admin.id,
        type: "contract_doc_overdue",
        entityType: "contract_document",
        entityId: doc.id,
        body,
        email: {
          subject: `Overdue response: ${title} (${job?.number ?? "?"})`,
          text: body,
        },
      });
    }
    await db
      .update(contractDocuments)
      .set({ overdueNotifiedAt: now, updatedAt: now })
      .where(eq(contractDocuments.id, doc.id));
    notified += 1;
  }
  return { overdueNotified: notified, scanned: overdue.length };
}
