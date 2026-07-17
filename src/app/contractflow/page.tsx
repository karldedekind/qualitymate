import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function ContractFlowOverviewPage() {
  await requireAdmin();
  const jobs = await listJobs({ activeOnly: true });

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">ContractFlow</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Jobs</h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link
                href={`/contractflow/${j.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium">{j.number}</span>{" "}
                  <span className="text-slate-600">{j.name}</span>
                </span>
                <span className="text-sm text-blue-700">Register →</span>
              </Link>
            </li>
          ))}
          {jobs.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-600">
              No active jobs. <Link href="/admin/jobs/new" className="underline">Create one</Link>.
            </li>
          )}
        </ul>
      </section>

      <section className="border-t border-slate-200 pt-6">
        <Link
          href="/contractflow/signature"
          className="group flex items-center justify-between gap-4 rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
        >
          <div>
            <div className="font-semibold text-indigo-900">My signature</div>
            <p className="mt-0.5 text-sm text-indigo-700">
              Upload or update the signature applied to issued documents.
            </p>
          </div>
          <span className="shrink-0 text-indigo-500 group-hover:text-indigo-800 transition-colors">
            Manage →
          </span>
        </Link>
      </section>
    </div>
  );
}
