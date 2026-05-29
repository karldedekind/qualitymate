import { recent, unreadCount } from "@/lib/notify";
import { NotificationsBellClient } from "./notifications-bell-client";

export async function NotificationsBell({ userId }: { userId: string }) {
  const [count, items] = await Promise.all([unreadCount(userId), recent(userId, 20)]);
  const serializable = items.map((n) => ({
    id: n.id,
    type: n.type,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
  return <NotificationsBellClient unread={count} items={serializable} />;
}
