import { and, desc, eq, isNull, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, user } from "@/db/schema";
import { isConfigured as smtpConfigured, sendMail } from "@/lib/smtp";

export type NotifyInput = {
  userId: string;
  type: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  email?: { subject: string; html?: string; text?: string } | null;
};

export type NotifyResult = {
  notificationId: number;
  emailQueued: boolean;
  emailError: string | null;
};

export async function send(input: NotifyInput): Promise<NotifyResult> {
  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      body: input.body,
    })
    .returning({ id: notifications.id });
  const notificationId = inserted[0]!.id;

  if (!input.email) {
    return { notificationId, emailQueued: false, emailError: null };
  }

  if (!(await smtpConfigured())) {
    return { notificationId, emailQueued: false, emailError: null };
  }

  const target = await db
    .select({ email: user.email, deactivatedAt: user.deactivatedAt })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);
  const u = target[0];
  if (!u || u.deactivatedAt) {
    return { notificationId, emailQueued: false, emailError: null };
  }

  const result = await sendMail({
    to: u.email,
    subject: input.email.subject,
    text: input.email.text,
    html: input.email.html,
  });
  if (result.ok) {
    return { notificationId, emailQueued: true, emailError: null };
  }
  return { notificationId, emailQueued: false, emailError: result.error };
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    drizzleSql`SELECT COUNT(*)::int AS n FROM "notifications" WHERE "user_id" = ${userId} AND "read_at" IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function recent(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markRead(notificationId: number, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
