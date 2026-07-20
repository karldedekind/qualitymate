import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, variationFiles, variations } from "@/db/schema";

export type Variation = typeof variations.$inferSelect;
export type VariationFile = typeof variationFiles.$inferSelect;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export type CreateVariationInput = {
  jobId: string;
  description: string;
  /** Explicit register number; next free number for the job when omitted. */
  number?: number | null;
  claimedValueCents?: number | null;
  timeImpactDays?: number | null;
  createdBy: string;
};

export async function createVariation(input: CreateVariationInput): Promise<Variation> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "jobs" WHERE "id" = ${input.jobId} FOR UPDATE`);
    let number = input.number ?? null;
    if (number == null) {
      const res = await tx.execute<{ next: number }>(
        sql`SELECT COALESCE(MAX("number"), 0) + 1 AS next
            FROM "variations" WHERE "job_id" = ${input.jobId}`,
      );
      number = Number(res[0]!.next);
    } else {
      const taken = await tx.execute(
        sql`SELECT 1 FROM "variations" WHERE "job_id" = ${input.jobId} AND "number" = ${number}`,
      );
      if (taken.length > 0) {
        throw new Error(`Variation ${number} already exists for this job.`);
      }
    }
    const [row] = await tx
      .insert(variations)
      .values({
        id: newId(),
        jobId: input.jobId,
        number,
        description: input.description.trim(),
        claimedValueCents: input.claimedValueCents ?? null,
        timeImpactDays: input.timeImpactDays ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    return row;
  });
}

export async function findVariationById(id: string): Promise<Variation | null> {
  const rows = await db.select().from(variations).where(eq(variations.id, id)).limit(1);
  return rows[0] ?? null;
}

export type UpdateVariationInput = {
  description?: string;
  claimedValueCents?: number | null;
  timeImpactDays?: number | null;
  status?: "proposed" | "submitted";
};

export async function updateVariation(
  id: string,
  input: UpdateVariationInput,
): Promise<Variation | null> {
  const patch: Partial<typeof variations.$inferInsert> = { updatedAt: new Date() };
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.claimedValueCents !== undefined) patch.claimedValueCents = input.claimedValueCents;
  if (input.timeImpactDays !== undefined) patch.timeImpactDays = input.timeImpactDays;
  if (input.status !== undefined) patch.status = input.status;
  const [row] = await db.update(variations).set(patch).where(eq(variations.id, id)).returning();
  return row ?? null;
}

export type DecideVariationInput = {
  status: "approved" | "rejected";
  /** Defaults to the claimed value when approved without an explicit figure. */
  approvedValueCents?: number | null;
};

export async function decideVariation(
  id: string,
  input: DecideVariationInput,
): Promise<Variation> {
  const existing = await findVariationById(id);
  if (!existing) throw new Error("Variation not found.");
  const approvedValueCents =
    input.status === "approved"
      ? (input.approvedValueCents ?? existing.claimedValueCents)
      : null;
  const [row] = await db
    .update(variations)
    .set({
      status: input.status,
      approvedValueCents,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(variations.id, id))
    .returning();
  return row;
}

export async function deleteVariation(id: string): Promise<void> {
  const existing = await findVariationById(id);
  if (!existing) return;
  if (existing.status !== "proposed") {
    throw new Error("Only a proposed variation can be deleted.");
  }
  await db.delete(variations).where(eq(variations.id, id));
}

export async function listVariationsForJob(jobId: string): Promise<Variation[]> {
  return db
    .select()
    .from(variations)
    .where(eq(variations.jobId, jobId))
    .orderBy(asc(variations.number));
}

export type ContractSumSummary = {
  originalCents: number | null;
  approvedVariationsCents: number;
  currentCents: number | null;
};

export async function contractSumSummary(jobId: string): Promise<ContractSumSummary> {
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) throw new Error("Job not found.");
  const approved = await db
    .select({ approvedValueCents: variations.approvedValueCents })
    .from(variations)
    .where(and(eq(variations.jobId, jobId), eq(variations.status, "approved")));
  const approvedVariationsCents = approved.reduce(
    (sum, r) => sum + (r.approvedValueCents ?? 0),
    0,
  );
  return {
    originalCents: job.contractSumCents,
    approvedVariationsCents,
    currentCents:
      job.contractSumCents == null ? null : job.contractSumCents + approvedVariationsCents,
  };
}

export type AddVariationFileInput = {
  variationId: string;
  path: string;
  originalFilename: string;
  uploadedBy: string;
};

export async function addVariationFile(input: AddVariationFileInput): Promise<VariationFile> {
  const [row] = await db
    .insert(variationFiles)
    .values({ id: newId(), ...input })
    .returning();
  return row;
}

export async function listVariationFiles(variationId: string): Promise<VariationFile[]> {
  return db
    .select()
    .from(variationFiles)
    .where(eq(variationFiles.variationId, variationId))
    .orderBy(asc(variationFiles.createdAt));
}

export async function listVariationFilesForJob(jobId: string): Promise<VariationFile[]> {
  const rows = await db
    .select({ file: variationFiles })
    .from(variationFiles)
    .innerJoin(variations, eq(variationFiles.variationId, variations.id))
    .where(eq(variations.jobId, jobId))
    .orderBy(asc(variationFiles.createdAt));
  return rows.map((r) => r.file);
}
