import { randomBytes } from "node:crypto";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, exists, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  DOC_CATEGORY_KIND,
  DOC_TYPE_KIND,
  DOC_USAGE_TRIGGER_KIND,
  type ControlledDocBlock,
  categories,
  controlledDocLegacyIds,
  controlledDocReviews,
  controlledDocUsageTriggers,
  controlledDocVersions,
  controlledDocuments,
} from "@/db/schema";

export type ControlledDocument = typeof controlledDocuments.$inferSelect;
export type ControlledDocVersion = typeof controlledDocVersions.$inferSelect;
export type ControlledDocReview = typeof controlledDocReviews.$inferSelect;
export type ReviewStatus = "ok" | "due_soon" | "overdue";

export const REVIEW_CYCLE_MONTHS = 12;
export const DUE_SOON_DAYS = 30;
const REGISTER_TIME_ZONE = "Australia/Brisbane";

function newId(): string {
  return randomBytes(12).toString("base64url");
}

/** Today's date (YYYY-MM-DD) in RIM's time zone. */
export function todayIso(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: REGISTER_TIME_ZONE });
}

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Adds calendar months to a YYYY-MM-DD date, clamping to the month's last day. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Due Soon within 30 days of the Next Review Date (inclusive of the date
 * itself), Overdue once it has passed.
 */
export function reviewStatus(nextReviewDate: string | null, today: string): ReviewStatus | null {
  if (!nextReviewDate) return null;
  const days = (isoToUtc(nextReviewDate) - isoToUtc(today)) / 86_400_000;
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

export function versionLabel(version: number): string {
  return `V${version}`;
}

// ── Lookup lists ─────────────────────────────────────────────────────────────

export type ListOption = { id: string; code: string; label: string };

export async function listFilterOptions(): Promise<{
  categories: ListOption[];
  types: ListOption[];
  triggers: ListOption[];
}> {
  const rows = await db
    .select({
      id: categories.id,
      code: categories.code,
      label: categories.label,
      kind: categories.kind,
    })
    .from(categories)
    .where(
      and(
        eq(categories.active, true),
        inArray(categories.kind, [DOC_CATEGORY_KIND, DOC_TYPE_KIND, DOC_USAGE_TRIGGER_KIND]),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.label));
  const pick = (kind: string) =>
    rows.filter((r) => r.kind === kind).map(({ id, code, label }) => ({ id, code, label }));
  return {
    categories: pick(DOC_CATEGORY_KIND),
    types: pick(DOC_TYPE_KIND),
    triggers: pick(DOC_USAGE_TRIGGER_KIND),
  };
}

// ── Register list ────────────────────────────────────────────────────────────

export type RegisterFilters = {
  categoryId?: string;
  typeId?: string;
  triggerId?: string;
  reviewStatus?: ReviewStatus;
  /** Matches Title, Document ID or any Legacy ID. */
  q?: string;
};

export type RegisterRow = {
  id: string;
  documentId: string;
  title: string;
  categoryCode: string;
  categoryLabel: string;
  typeCode: string;
  typeLabel: string;
  /** The current (issued) Version, or the draft when nothing is issued yet. */
  version: number | null;
  versionStatus: ControlledDocVersion["status"] | null;
  dateIssued: string | null;
  nextReviewDate: string | null;
  reviewStatus: ReviewStatus | null;
  triggers: ListOption[];
};

const categoryRow = alias(categories, "doc_category");
const typeRow = alias(categories, "doc_type");

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The register list. Without `includeDrafts` only documents with an issued
 * Version are returned (drafts and unissued documents are admin-only).
 */
export async function listRegister(opts: {
  includeDrafts: boolean;
  filters?: RegisterFilters;
  today?: string;
}): Promise<RegisterRow[]> {
  const f = opts.filters ?? {};
  const today = opts.today ?? todayIso();
  const conds = [];
  if (f.categoryId) conds.push(eq(controlledDocuments.categoryId, f.categoryId));
  if (f.typeId) conds.push(eq(controlledDocuments.typeId, f.typeId));
  if (f.triggerId) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(controlledDocUsageTriggers)
          .where(
            and(
              eq(controlledDocUsageTriggers.documentId, controlledDocuments.id),
              eq(controlledDocUsageTriggers.triggerId, f.triggerId),
            ),
          ),
      ),
    );
  }
  const q = f.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conds.push(
      or(
        ilike(controlledDocuments.title, pattern),
        ilike(controlledDocuments.documentId, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(controlledDocLegacyIds)
            .where(
              and(
                eq(controlledDocLegacyIds.documentId, controlledDocuments.id),
                ilike(controlledDocLegacyIds.legacyId, pattern),
              ),
            ),
        ),
      )!,
    );
  }

  const docs = await db
    .select({
      id: controlledDocuments.id,
      documentId: controlledDocuments.documentId,
      title: controlledDocuments.title,
      categoryCode: categoryRow.code,
      categoryLabel: categoryRow.label,
      typeCode: typeRow.code,
      typeLabel: typeRow.label,
    })
    .from(controlledDocuments)
    .innerJoin(categoryRow, eq(categoryRow.id, controlledDocuments.categoryId))
    .innerJoin(typeRow, eq(typeRow.id, controlledDocuments.typeId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(controlledDocuments.documentId));
  if (docs.length === 0) return [];

  const ids = docs.map((d) => d.id);
  const [versions, triggerLinks] = await Promise.all([
    db
      .select()
      .from(controlledDocVersions)
      .where(
        and(
          inArray(controlledDocVersions.documentId, ids),
          ne(controlledDocVersions.status, "superseded"),
        ),
      ),
    db
      .select({
        documentId: controlledDocUsageTriggers.documentId,
        id: categories.id,
        code: categories.code,
        label: categories.label,
      })
      .from(controlledDocUsageTriggers)
      .innerJoin(categories, eq(categories.id, controlledDocUsageTriggers.triggerId))
      .where(inArray(controlledDocUsageTriggers.documentId, ids))
      .orderBy(asc(categories.sortOrder), asc(categories.label)),
  ]);

  const rows: RegisterRow[] = [];
  for (const d of docs) {
    const issued = versions.find((v) => v.documentId === d.id && v.status === "issued");
    const draft = versions.find((v) => v.documentId === d.id && v.status === "draft");
    if (!issued && !opts.includeDrafts) continue;
    const shown = issued ?? draft ?? null;
    const status = issued ? reviewStatus(issued.nextReviewDate, today) : null;
    if (f.reviewStatus && status !== f.reviewStatus) continue;
    rows.push({
      ...d,
      version: shown?.version ?? null,
      versionStatus: shown?.status ?? null,
      dateIssued: issued?.dateIssued ?? null,
      nextReviewDate: issued?.nextReviewDate ?? null,
      reviewStatus: status,
      triggers: triggerLinks
        .filter((t) => t.documentId === d.id)
        .map(({ id, code, label }) => ({ id, code, label })),
    });
  }
  return rows;
}

// ── Document page ────────────────────────────────────────────────────────────

export type DocumentDetail = ControlledDocument & {
  category: ListOption;
  type: ListOption;
  current: ControlledDocVersion | null;
  draft: ControlledDocVersion | null;
  legacyIds: { legacyId: string; source: string | null }[];
  triggers: ListOption[];
};

/** Returns null when the document doesn't exist or is unissued and drafts aren't allowed. */
export async function findDocument(
  id: string,
  opts: { includeDrafts: boolean },
): Promise<DocumentDetail | null> {
  const [doc] = await db
    .select({
      doc: controlledDocuments,
      category: { id: categoryRow.id, code: categoryRow.code, label: categoryRow.label },
      type: { id: typeRow.id, code: typeRow.code, label: typeRow.label },
    })
    .from(controlledDocuments)
    .innerJoin(categoryRow, eq(categoryRow.id, controlledDocuments.categoryId))
    .innerJoin(typeRow, eq(typeRow.id, controlledDocuments.typeId))
    .where(eq(controlledDocuments.id, id))
    .limit(1);
  if (!doc) return null;

  const [versions, legacyIds, triggers] = await Promise.all([
    db
      .select()
      .from(controlledDocVersions)
      .where(
        and(
          eq(controlledDocVersions.documentId, id),
          ne(controlledDocVersions.status, "superseded"),
        ),
      ),
    db
      .select({ legacyId: controlledDocLegacyIds.legacyId, source: controlledDocLegacyIds.source })
      .from(controlledDocLegacyIds)
      .where(eq(controlledDocLegacyIds.documentId, id))
      .orderBy(asc(controlledDocLegacyIds.legacyId)),
    db
      .select({ id: categories.id, code: categories.code, label: categories.label })
      .from(controlledDocUsageTriggers)
      .innerJoin(categories, eq(categories.id, controlledDocUsageTriggers.triggerId))
      .where(eq(controlledDocUsageTriggers.documentId, id))
      .orderBy(asc(categories.sortOrder), asc(categories.label)),
  ]);
  const current = versions.find((v) => v.status === "issued") ?? null;
  const draft = versions.find((v) => v.status === "draft") ?? null;
  if (!current && !opts.includeDrafts) return null;

  return {
    ...doc.doc,
    category: doc.category,
    type: doc.type,
    current,
    draft: opts.includeDrafts ? draft : null,
    legacyIds,
    triggers,
  };
}

export type HistoryEntry = ControlledDocVersion & { reviews: ControlledDocReview[] };

/** Every Version, newest first, each with its Reviews (newest first). */
export async function listVersionHistory(
  documentId: string,
  opts: { includeDrafts: boolean },
): Promise<HistoryEntry[]> {
  const versions = await db
    .select()
    .from(controlledDocVersions)
    .where(
      and(
        eq(controlledDocVersions.documentId, documentId),
        opts.includeDrafts ? undefined : ne(controlledDocVersions.status, "draft"),
      ),
    )
    .orderBy(desc(controlledDocVersions.version));
  if (versions.length === 0) return [];
  const reviews = await db
    .select()
    .from(controlledDocReviews)
    .where(
      inArray(
        controlledDocReviews.versionId,
        versions.map((v) => v.id),
      ),
    )
    .orderBy(desc(controlledDocReviews.reviewedOn), desc(controlledDocReviews.createdAt));
  return versions.map((v) => ({ ...v, reviews: reviews.filter((r) => r.versionId === v.id) }));
}

// ── Writes (admin-only callers) ──────────────────────────────────────────────

export type CreateDocumentInput = {
  documentId: string;
  categoryId: string;
  typeId: string;
  number: number;
  title: string;
  notes?: string | null;
  legacyIds?: { legacyId: string; source?: string | null }[];
  triggerIds?: string[];
  createdBy?: string | null;
};

export async function createDocument(input: CreateDocumentInput): Promise<ControlledDocument> {
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(controlledDocuments)
      .values({
        id: newId(),
        documentId: input.documentId,
        categoryId: input.categoryId,
        typeId: input.typeId,
        number: input.number,
        title: input.title,
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (input.legacyIds?.length) {
      await tx.insert(controlledDocLegacyIds).values(
        input.legacyIds.map((l) => ({
          id: newId(),
          documentId: doc.id,
          legacyId: l.legacyId,
          source: l.source ?? null,
        })),
      );
    }
    if (input.triggerIds?.length) {
      await tx
        .insert(controlledDocUsageTriggers)
        .values(input.triggerIds.map((triggerId) => ({ documentId: doc.id, triggerId })));
    }
    return doc;
  });
}

/** Opens the next Version as a draft. */
export async function createDraftVersion(input: {
  documentId: string;
  content: ControlledDocBlock[];
  sourceFilePath?: string | null;
  sourceFileName?: string | null;
  createdBy?: string | null;
}): Promise<ControlledDocVersion> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${controlledDocVersions.version}), 0)::int` })
    .from(controlledDocVersions)
    .where(eq(controlledDocVersions.documentId, input.documentId));
  const [row] = await db
    .insert(controlledDocVersions)
    .values({
      id: newId(),
      documentId: input.documentId,
      version: max + 1,
      status: "draft",
      content: input.content,
      sourceFilePath: input.sourceFilePath ?? null,
      sourceFileName: input.sourceFileName ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

/**
 * Approves and issues a draft. The previous current Version becomes a
 * Superseded Version archived on the issue date. The Next Review Date is 12
 * months after issue.
 */
export async function issueVersion(input: {
  versionId: string;
  approver: { id: string | null; name: string };
  dateIssued: string;
}): Promise<ControlledDocVersion> {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(controlledDocVersions)
      .where(eq(controlledDocVersions.id, input.versionId))
      .for("update")
      .limit(1);
    if (!draft) throw new Error("Version not found");
    if (draft.status !== "draft") throw new Error("Only a draft Version can be issued");

    await tx
      .update(controlledDocVersions)
      .set({ status: "superseded", archiveDate: input.dateIssued, updatedAt: new Date() })
      .where(
        and(
          eq(controlledDocVersions.documentId, draft.documentId),
          eq(controlledDocVersions.status, "issued"),
        ),
      );
    const [issued] = await tx
      .update(controlledDocVersions)
      .set({
        status: "issued",
        dateIssued: input.dateIssued,
        nextReviewDate: addMonthsIso(input.dateIssued, REVIEW_CYCLE_MONTHS),
        approvedBy: input.approver.id,
        approvedByName: input.approver.name,
        updatedAt: new Date(),
      })
      .where(eq(controlledDocVersions.id, draft.id))
      .returning();
    return issued;
  });
}
