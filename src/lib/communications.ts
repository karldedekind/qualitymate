import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { communications } from "@/db/schema";

export type Communication = typeof communications.$inferSelect;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export type LogCommunicationInput = {
  jobId: string;
  direction: "inbound" | "outbound";
  subject: string;
  occurredAt: Date;
  path?: string | null;
  originalFilename?: string | null;
  note?: string | null;
  documentId?: string | null;
  variationId?: string | null;
  createdBy: string | null;
};

export async function logCommunication(input: LogCommunicationInput): Promise<Communication> {
  const [row] = await db
    .insert(communications)
    .values({
      id: newId(),
      jobId: input.jobId,
      direction: input.direction,
      subject: input.subject.trim(),
      occurredAt: input.occurredAt,
      path: input.path ?? null,
      originalFilename: input.originalFilename ?? null,
      note: input.note ?? null,
      documentId: input.documentId ?? null,
      variationId: input.variationId ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function listCommunicationsForJob(jobId: string): Promise<Communication[]> {
  return db
    .select()
    .from(communications)
    .where(eq(communications.jobId, jobId))
    .orderBy(desc(communications.occurredAt));
}

export async function listCommunicationsForDocument(
  documentId: string,
): Promise<Communication[]> {
  return db
    .select()
    .from(communications)
    .where(eq(communications.documentId, documentId))
    .orderBy(desc(communications.occurredAt));
}
