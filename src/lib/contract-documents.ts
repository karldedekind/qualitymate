import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type ContractDocContent,
  contractDocVersions,
  contractDocuments,
} from "@/db/schema";
import { saveBytes } from "@/lib/uploads";

export type ContractDocument = typeof contractDocuments.$inferSelect;
export type ContractDocVersion = typeof contractDocVersions.$inferSelect;
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
