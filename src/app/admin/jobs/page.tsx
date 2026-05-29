import Link from "next/link";
import { listJobs } from "@/lib/jobs";
import { JobRow } from "./job-row";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  const all = await listJobs();
  const active = all.filter((j) => j.active);
  const inactive = all.filter((j) => !j.active);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Jobs</h1>
          <p className="text-slate-600 text-sm">
            Manage construction jobs. Active jobs appear in the public site check-in dropdown.
          </p>
        </div>
        <Link
          href="/admin/jobs/new"
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium"
        >
          New job
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Active ({active.length})</h2>
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No active jobs yet.</td></tr>
              ) : (
                active.map((j) => <JobRow key={j.id} job={j} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Inactive ({inactive.length})</h2>
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Number</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inactive.map((j) => <JobRow key={j.id} job={j} inactive />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
