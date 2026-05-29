import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { correctiveActions, incidents, user } from "@/db/schema";
import { ResolveButton } from "../../actions/resolve-button";

export const dynamic = "force-dynamic";

function fmt(date: Date | null) {
  if (!date) return "—";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export default async function AdminActionsPage() {
  const rows = await db
    .select({
      a: correctiveActions,
      assigneeName: user.name,
      assigneeEmail: user.email,
      incidentTitle: incidents.title,
    })
    .from(correctiveActions)
    .leftJoin(user, eq(correctiveActions.assigneeId, user.id))
    .leftJoin(incidents, eq(correctiveActions.incidentId, incidents.id))
    .orderBy(asc(correctiveActions.status), asc(correctiveActions.deadline), desc(correctiveActions.createdAt));

  const now = Date.now();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Corrective actions</h1>
      <p className="text-slate-600 text-sm">
        Create actions from an incident&apos;s detail page. Hourly cron sends due-soon and
        overdue alerts to assignees.
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-slate-600">No actions yet.</p>
      )}

      <ul className="space-y-3">
        {rows.map((r) => {
          const a = r.a;
          const overdue = a.status === "open" && a.deadline.getTime() < now;
          return (
            <li
              key={a.id}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        a.status === "resolved"
                          ? "bg-slate-100 text-slate-700"
                          : overdue
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {a.status === "resolved" ? "resolved" : overdue ? "overdue" : "open"}
                    </span>
                    <span className="font-medium">{a.title}</span>
                  </div>
                  {a.description && (
                    <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                      {a.description}
                    </p>
                  )}
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                    <span>Deadline: <span className="font-mono">{fmt(a.deadline)}</span></span>
                    <span>
                      Assignee:{" "}
                      {r.assigneeName ? `${r.assigneeName} (${r.assigneeEmail})` : "—"}
                    </span>
                    {r.incidentTitle && (
                      <span>
                        Incident:{" "}
                        <Link
                          href={`/admin/incidents/${a.incidentId}`}
                          className="text-blue-700 hover:underline"
                        >
                          {r.incidentTitle}
                        </Link>
                      </span>
                    )}
                    {a.dueSoonNotifiedAt && (
                      <span>Due-soon notified: {fmt(a.dueSoonNotifiedAt)}</span>
                    )}
                    {a.overdueNotifiedAt && (
                      <span>Overdue notified: {fmt(a.overdueNotifiedAt)}</span>
                    )}
                  </div>
                  {a.resolutionNote && (
                    <p className="text-xs text-slate-600 mt-1">Note: {a.resolutionNote}</p>
                  )}
                </div>
                {a.status === "open" && <ResolveButton id={a.id} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
