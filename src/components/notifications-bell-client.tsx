"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markReadAction, markAllReadAction } from "@/app/notifications/actions";

export type NotificationItem = {
  id: number;
  type: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsBellClient({
  unread,
  items,
}: {
  unread: number;
  items: NotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function onItemClick(id: number) {
    startTransition(async () => {
      await markReadAction(id);
      router.refresh();
    });
  }

  function onMarkAll() {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`${unread} unread notifications`}
        className="relative rounded-md p-2 hover:bg-slate-100"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button onClick={onMarkAll} className="text-xs text-blue-700 underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">No notifications.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`px-3 py-2 border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${
                    n.readAt ? "" : "bg-blue-50"
                  }`}
                  onClick={() => onItemClick(n.id)}
                >
                  <div className="text-sm">{n.body}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
