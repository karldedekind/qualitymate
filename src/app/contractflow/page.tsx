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
    </div>
  );
}
