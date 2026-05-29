import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor = { id: string; email: string } | null;

export type RequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditInput = {
  actor: Actor;
  action: string;
  entity: { type: string; id?: string | null };
  before?: unknown;
  after?: unknown;
  request?: RequestMeta;
};

export type AuditEvent = typeof auditLog.$inferSelect;

export type QueryFilters = {
  from?: Date | null;
  to?: Date | null;
  entityType?: string | null;
  entityId?: string | null;
  limit?: number;
};

export async function record(input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    userId: input.actor?.id ?? null,
    userEmailSnapshot: input.actor?.email ?? null,
    entityType: input.entity.type,
    entityId: input.entity.id ?? null,
    action: input.action,
    before: (input.before ?? null) as never,
    after: (input.after ?? null) as never,
    ip: input.request?.ip ?? null,
    userAgent: input.request?.userAgent ?? null,
  });
}

export async function history(entityType: string, entityId: string): Promise<AuditEvent[]> {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.ts));
}

export async function query(filters: QueryFilters = {}): Promise<AuditEvent[]> {
  const conds = [];
  if (filters.from) conds.push(gte(auditLog.ts, filters.from));
  if (filters.to) conds.push(lte(auditLog.ts, filters.to));
  if (filters.entityType) conds.push(eq(auditLog.entityType, filters.entityType));
  if (filters.entityId) conds.push(eq(auditLog.entityId, filters.entityId));

  return db
    .select()
    .from(auditLog)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(auditLog.ts))
    .limit(filters.limit ?? 1000);
}

export async function recent(limit = 100): Promise<AuditEvent[]> {
  return db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(limit);
}

export async function distinctEntityTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ entityType: auditLog.entityType })
    .from(auditLog);
  return rows.map((r) => r.entityType).sort();
}
