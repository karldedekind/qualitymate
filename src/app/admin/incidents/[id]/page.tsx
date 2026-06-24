import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, user } from "@/db/schema";
import { listForIncident } from "@/lib/actions";
import { isConfigured as isAiConfigured } from "@/lib/ai";
import {
  findById,
  findRegisterEntryByIncident,
  photosFor,
} from "@/lib/incidents";
import { findJobById, listJobs } from "@/lib/jobs";
import { AssignJobPanel } from "./assign-job";
import { CreateActionForm } from "./create-action";
import { ReviewButton, CloseForm } from "./review-close";
import { TriagePanel, type CategoryOption } from "./triage";
import { ResolveButton } from "../../../actions/resolve-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  open: "Open",
  closed: "Closed",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

const BACK_TABS = new Set(["pending_review", "open", "closed"]);

async function listActiveCategories(): Promise<CategoryOption[]> {
  const rows = await db
    .select({ id: categories.id, code: categories.code, label: categories.label })
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.code));
  return rows;
}

export default async function AdminIncidentDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { from } = await searchParams;
  const incident = await findById(id);
  if (!incident) notFound();

  // Return to the tab the admin came from; default to the all-incidents list.
  const backHref = from && BACK_TABS.has(from) ? `/admin/incidents?status=${from}` : "/admin/incidents";

  const [photos, job, assignableJobs, registerEntry, aiAvailable, cats, actions, assignees] =
    await Promise.all([
      photosFor(id),
      incident.jobId ? findJobById(incident.jobId) : Promise.resolve(null),
      incident.jobId ? Promise.resolve([]) : listJobs({ activeOnly: true }),
      findRegisterEntryByIncident(id),
      isAiConfigured(),
      listActiveCategories(),
      listForIncident(id),
      db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(isNull(user.deactivatedAt))
        .orderBy(asc(user.name)),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-blue-700 hover:underline">
          ← All incidents
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{incident.title}</h1>
        <div className="text-sm text-slate-600">
          Status: <span className="font-medium">{STATUS_LABEL[incident.status] ?? incident.status}</span>
          {job ? (
            <>
              {" · "}Job <span className="font-mono">{job.number}</span> {job.name}
              <span className="text-slate-400"> (set at recording)</span>
            </>
          ) : null}
          {" · "}Filed {incident.createdAt.toISOString()}
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <h2 className="text-base font-medium mb-2">Description</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-800">{incident.description}</p>
      </section>

      {!incident.jobId && (
        <AssignJobPanel
          id={incident.id}
          jobs={assignableJobs.map((j) => ({ id: j.id, number: j.number, name: j.name }))}
        />
      )}

      {photos.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-base font-medium mb-3">Photos ({photos.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => (
              <a
                key={p.id}
                href={`/uploads/${p.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-100 rounded-md overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/uploads/${p.path}`}
                  alt={p.originalFilename ?? "photo"}
                  className="w-full h-32 object-cover"
                />
                <div className="p-1 text-[10px] font-mono text-slate-500 truncate">
                  {p.takenAt ? p.takenAt.toISOString().slice(0, 10) : "no exif"}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {incident.status !== "closed" && (
        <TriagePanel
          id={incident.id}
          aiAvailable={aiAvailable}
          current={{
            priority: incident.priority,
            rootCause: incident.rootCause,
            categoryId: incident.categoryId,
          }}
          categories={cats}
        />
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-medium">Corrective actions ({actions.length})</h2>
        </header>

        {actions.length > 0 && (
          <ul className="space-y-2">
            {actions.map((a) => {
              const overdue = a.status === "open" && a.deadline.getTime() < Date.now();
              return (
                <li
                  key={a.id}
                  className="border border-slate-200 rounded-md p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
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
                    <div className="text-xs text-slate-500 mt-1">
                      Deadline:{" "}
                      <span className="font-mono">
                        {a.deadline.toISOString().slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                  </div>
                  {a.status === "open" && <ResolveButton id={a.id} />}
                </li>
              );
            })}
          </ul>
        )}

        <CreateActionForm incidentId={incident.id} assignees={assignees} />
      </section>

      {incident.status === "pending_review" && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
          <h2 className="text-base font-medium">Move to open</h2>
          <p className="text-sm text-slate-600">
            Once triage is captured above, move to open to begin investigation.
          </p>
          <ReviewButton id={incident.id} />
        </section>
      )}

      {incident.status === "open" && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
          <h2 className="text-base font-medium">Close incident</h2>
          <p className="text-sm text-slate-600">
            Closing creates a register entry. Provide a reason or summary outcome.
          </p>
          <CloseForm id={incident.id} />
        </section>
      )}

      {incident.status === "closed" && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-2">
          <h2 className="text-base font-medium">Closed</h2>
          <div className="text-sm text-slate-700">
            Closed at <span className="font-mono">{incident.closedAt?.toISOString()}</span>
          </div>
          {incident.closeReason && (
            <div className="text-sm">
              <span className="text-slate-500">Reason:</span> {incident.closeReason}
            </div>
          )}
          {incident.priority && (
            <div className="text-sm">
              <span className="text-slate-500">Priority:</span> {incident.priority}
            </div>
          )}
          {incident.rootCause && (
            <div className="text-sm">
              <span className="text-slate-500">Root cause:</span>{" "}
              <span className="whitespace-pre-wrap">{incident.rootCause}</span>
            </div>
          )}
          {registerEntry && (
            <div className="text-xs text-slate-500">
              Register entry: <span className="font-mono">{registerEntry.id}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
