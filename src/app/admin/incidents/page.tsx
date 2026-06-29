import Link from "next/link";
import { listByStatusWithJob } from "@/lib/incidents";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending",
  open: "Open",
  closed: "Closed",
};

type SearchParams = Promise<{ status?: string }>;

export default async function AdminIncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { status } = await searchParams;
  const active = (status === "open" || status === "closed" ? status : "pending_review") as
    | "pending_review"
    | "open"
    | "closed";
  const rows = await listByStatusWithJob(active);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Incidents</h1>
          <p className="text-slate-600 text-sm">
            Triage submissions. Move pending to open, then close with a reason.
          </p>
        </div>
        <Link
          href="/incidents/new"
          className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-white text-blue-700 hover:bg-blue-50 px-4 py-2 text-sm font-medium transition-colors shrink-0"
        >
          <span className="text-lg leading-none">+</span>
          File an Incident
        </Link>
      </div>

      <nav className="flex gap-2 text-sm">
        {(["pending_review", "open", "closed"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/incidents?status=${s}`}
            className={`px-3 py-1.5 rounded-md border ${
              active === s ? "bg-blue-700 text-white border-blue-700" : "bg-white border-slate-300"
            }`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Filed</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No incidents.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.jobNumber ? `${r.jobNumber} — ${r.jobName}` : "—"}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/incidents/${r.id}?from=${active}`}
                      className="text-blue-700 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
