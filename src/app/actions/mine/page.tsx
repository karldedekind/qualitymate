import Link from "next/link";
import { BrandedHeader } from "@/components/branded-header";
import { requireUser } from "@/lib/auth-helpers";
import { listForUserWithIncident } from "@/lib/actions";
import { ResolveButton } from "../resolve-button";

export const dynamic = "force-dynamic";

function fmt(date: Date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export default async function MyActionsPage() {
  const user = await requireUser();
  const items = await listForUserWithIncident(user.id);
  const now = Date.now();

  return (
    <div className="min-h-screen flex flex-col">
      <BrandedHeader showSignOut />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-6 space-y-4">
        <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">My corrective actions</h1>

        {items.length === 0 && (
          <p className="text-sm text-slate-600">Nothing assigned to you. </p>
        )}

        <ul className="space-y-3">
          {items.map((a) => {
            const overdue =
              a.status === "open" && a.deadline.getTime() < now ? true : false;
            return (
              <li
                key={a.id}
                className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
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
                      <h2 className="font-medium truncate">{a.title}</h2>
                    </div>
                    {a.description && (
                      <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                        {a.description}
                      </p>
                    )}
                    <div className="text-xs text-slate-500 mt-1">
                      Deadline: <span className="font-mono">{fmt(a.deadline)}</span>
                      {a.incidentTitle && (
                        <>
                          {" · "}Incident:{" "}
                          <Link
                            href={`/admin/incidents/${a.incidentId}`}
                            className="text-blue-700 hover:underline"
                          >
                            {a.incidentTitle}
                          </Link>
                        </>
                      )}
                    </div>
                    {a.status === "resolved" && a.resolutionNote && (
                      <p className="text-xs text-slate-600 mt-1">
                        Note: {a.resolutionNote}
                      </p>
                    )}
                    {a.status === "resolved" && a.resolutionPhotoPath && (
                      <a
                        href={`/uploads/${a.resolutionPhotoPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/uploads/${a.resolutionPhotoPath}`}
                          alt="Resolution photo"
                          className="h-24 rounded border border-slate-200 object-cover"
                        />
                      </a>
                    )}
                  </div>
                  {a.status === "open" && <ResolveButton id={a.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
