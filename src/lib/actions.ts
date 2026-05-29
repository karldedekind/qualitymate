/**
 * Corrective actions module.
 *
 * - create / assign / resolve mutate state and return the row.
 * - dueSoonScan returns actions whose deadline is within `windowMs` (default 3d)
 *   and not yet resolved AND not yet notified for due-soon.
 * - overdueScan returns past-deadline, not-yet-resolved, not-yet-notified-overdue.
 * - runScans() runs both, fans out via Notify, marks the corresponding
 *   `*_notified_at` so the next scan does not re-notify.
 */

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { correctiveActions, incidents, user } from "@/db/schema";
import { send } from "@/lib/notify";
import { record } from "@/lib/audit";

export type CorrectiveAction = typeof correctiveActions.$inferSelect;
export type ActionStatus = "open" | "resolved";

export const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export type CreateInput = {
  incidentId?: string | null;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  deadline: Date;
  createdBy: string;
};

export async function create(input: CreateInput): Promise<CorrectiveAction> {
  const [row] = await db
    .insert(correctiveActions)
    .values({
      id: newId(),
      incidentId: input.incidentId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assigneeId: input.assigneeId ?? null,
      deadline: input.deadline,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function assign(id: string, assigneeId: string | null): Promise<CorrectiveAction | null> {
  const [row] = await db
    .update(correctiveActions)
    .set({
      assigneeId,
      updatedAt: new Date(),
      // Reassign clears prior notification stamps so the new assignee can
      // be alerted afresh.
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
    })
    .where(eq(correctiveActions.id, id))
    .returning();
  return row ?? null;
}

export async function resolve(
  id: string,
  resolvedBy: string,
  note?: string | null,
  photoPath?: string | null,
): Promise<CorrectiveAction | null> {
  const now = new Date();
  const [row] = await db
    .update(correctiveActions)
    .set({
      status: "resolved",
      resolvedAt: now,
      resolvedBy,
      resolutionNote: note?.trim() || null,
      resolutionPhotoPath: photoPath ?? null,
      updatedAt: now,
    })
    .where(eq(correctiveActions.id, id))
    .returning();
  return row ?? null;
}

export async function findById(id: string): Promise<CorrectiveAction | null> {
  const rows = await db
    .select()
    .from(correctiveActions)
    .where(eq(correctiveActions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listForUser(userId: string, limit = 200): Promise<CorrectiveAction[]> {
  return db
    .select()
    .from(correctiveActions)
    .where(eq(correctiveActions.assigneeId, userId))
    .orderBy(asc(correctiveActions.status), asc(correctiveActions.deadline))
    .limit(limit);
}

export async function listForIncident(incidentId: string): Promise<CorrectiveAction[]> {
  return db
    .select()
    .from(correctiveActions)
    .where(eq(correctiveActions.incidentId, incidentId))
    .orderBy(asc(correctiveActions.deadline));
}

export async function listAll(limit = 500): Promise<CorrectiveAction[]> {
  return db
    .select()
    .from(correctiveActions)
    .orderBy(desc(correctiveActions.createdAt))
    .limit(limit);
}

export async function dueSoonScan(now: Date = new Date()): Promise<CorrectiveAction[]> {
  const cutoff = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  return db
    .select()
    .from(correctiveActions)
    .where(
      and(
        eq(correctiveActions.status, "open"),
        lte(correctiveActions.deadline, cutoff),
        isNull(correctiveActions.dueSoonNotifiedAt),
        // exclude already-overdue from due-soon bucket — those go through overdueScan
        // but we still allow due-soon to fire even if past, by checking deadline >= now.
      ),
    )
    .orderBy(asc(correctiveActions.deadline));
}

export async function overdueScan(now: Date = new Date()): Promise<CorrectiveAction[]> {
  return db
    .select()
    .from(correctiveActions)
    .where(
      and(
        eq(correctiveActions.status, "open"),
        lte(correctiveActions.deadline, now),
        isNull(correctiveActions.overdueNotifiedAt),
      ),
    )
    .orderBy(asc(correctiveActions.deadline));
}

export type ScanEvent =
  | { kind: "due_soon"; action: CorrectiveAction; daysUntilDue: number }
  | { kind: "overdue"; action: CorrectiveAction; daysOverdue: number };

export type ScanRunResult = {
  dueSoonNotified: number;
  overdueNotified: number;
  events: ScanEvent[];
};

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

async function deliverEvent(event: ScanEvent): Promise<boolean> {
  const action = event.action;
  if (!action.assigneeId) return false;

  const target = await db
    .select({ deactivatedAt: user.deactivatedAt })
    .from(user)
    .where(eq(user.id, action.assigneeId))
    .limit(1);
  const u = target[0];
  if (!u || u.deactivatedAt) return false;

  const subject =
    event.kind === "due_soon"
      ? `Action due soon: ${action.title}`
      : `Action overdue: ${action.title}`;
  const deadlineIso = action.deadline.toISOString();
  const body =
    event.kind === "due_soon"
      ? `Due in ${event.daysUntilDue} day(s) (deadline ${deadlineIso}).`
      : `Overdue by ${event.daysOverdue} day(s) (deadline ${deadlineIso}).`;

  await send({
    userId: action.assigneeId,
    type: event.kind === "due_soon" ? "action_due_soon" : "action_overdue",
    entityType: "corrective_action",
    entityId: action.id,
    body: `${action.title} — ${body}`,
    email: { subject, text: body },
  });
  return true;
}

async function markNotified(id: string, kind: "due_soon" | "overdue", at: Date): Promise<void> {
  const patch: Partial<typeof correctiveActions.$inferInsert> =
    kind === "due_soon"
      ? { dueSoonNotifiedAt: at, updatedAt: at }
      : { overdueNotifiedAt: at, updatedAt: at };
  await db.update(correctiveActions).set(patch).where(eq(correctiveActions.id, id));
}

export async function runScans(now: Date = new Date()): Promise<ScanRunResult> {
  const dueSoonItems = await dueSoonScan(now);
  const overdueItems = await overdueScan(now);

  const events: ScanEvent[] = [];
  let dueSoonNotified = 0;
  let overdueNotified = 0;

  for (const action of dueSoonItems) {
    if (action.deadline.getTime() < now.getTime()) {
      // Already overdue — let overdueScan handle it. Skip due-soon for this one.
      continue;
    }
    const daysUntilDue = Math.max(0, diffDays(action.deadline, now));
    const event: ScanEvent = { kind: "due_soon", action, daysUntilDue };
    const delivered = await deliverEvent(event);
    if (delivered) dueSoonNotified += 1;
    await markNotified(action.id, "due_soon", now);
    events.push(event);
  }

  for (const action of overdueItems) {
    const daysOverdue = Math.max(0, diffDays(now, action.deadline));
    const event: ScanEvent = { kind: "overdue", action, daysOverdue };
    const delivered = await deliverEvent(event);
    if (delivered) overdueNotified += 1;
    await markNotified(action.id, "overdue", now);
    events.push(event);
  }

  await record({
    actor: null,
    action: "actions.scan",
    entity: { type: "system", id: "actions" },
    after: {
      dueSoonCandidates: dueSoonItems.length,
      overdueCandidates: overdueItems.length,
      dueSoonNotified,
      overdueNotified,
    },
  });

  return { dueSoonNotified, overdueNotified, events };
}

export type ActionWithIncident = CorrectiveAction & { incidentTitle: string | null };

export async function listForUserWithIncident(userId: string): Promise<ActionWithIncident[]> {
  const rows = await db
    .select({
      a: correctiveActions,
      title: incidents.title,
    })
    .from(correctiveActions)
    .leftJoin(incidents, eq(correctiveActions.incidentId, incidents.id))
    .where(eq(correctiveActions.assigneeId, userId))
    .orderBy(asc(correctiveActions.status), asc(correctiveActions.deadline));
  return rows.map((r) => ({ ...r.a, incidentTitle: r.title }));
}
