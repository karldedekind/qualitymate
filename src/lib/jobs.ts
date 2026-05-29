import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export type Job = typeof jobs.$inferSelect;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export async function listJobs(opts: { activeOnly?: boolean } = {}): Promise<Job[]> {
  if (opts.activeOnly) {
    return db.select().from(jobs).where(eq(jobs.active, true)).orderBy(asc(jobs.number));
  }
  return db.select().from(jobs).orderBy(asc(jobs.number));
}

export async function findJobById(id: string): Promise<Job | null> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findJobByNumber(number: string): Promise<Job | null> {
  const rows = await db.select().from(jobs).where(eq(jobs.number, number)).limit(1);
  return rows[0] ?? null;
}

export type CreateJobInput = {
  number: string;
  name: string;
  address?: string | null;
  createdBy: string;
};

export async function createJob(input: CreateJobInput): Promise<Job> {
  const id = newId();
  const [row] = await db
    .insert(jobs)
    .values({
      id,
      number: input.number.trim(),
      name: input.name.trim(),
      address: input.address?.trim() || null,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export type UpdateJobInput = {
  number?: string;
  name?: string;
  address?: string | null;
  active?: boolean;
};

export async function updateJob(id: string, input: UpdateJobInput): Promise<Job | null> {
  const patch: Partial<typeof jobs.$inferInsert> = { updatedAt: new Date() };
  if (input.number !== undefined) patch.number = input.number.trim();
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.address !== undefined) patch.address = input.address?.trim() || null;
  if (input.active !== undefined) patch.active = input.active;
  const [row] = await db.update(jobs).set(patch).where(eq(jobs.id, id)).returning();
  return row ?? null;
}

export async function deactivateJob(id: string): Promise<void> {
  await db.update(jobs).set({ active: false, updatedAt: new Date() }).where(eq(jobs.id, id));
}

export async function activateJob(id: string): Promise<void> {
  await db.update(jobs).set({ active: true, updatedAt: new Date() }).where(eq(jobs.id, id));
}
