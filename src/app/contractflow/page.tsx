import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { documentTitle, listOpenAcrossJobs } from "@/lib/contract-documents";
import { listJobs } from "@/lib/jobs";
import { STATUS_CLASS, STATUS_LABEL, formatIsoDate } from "./format";

export const dynamic = "force-dynamic";

export default async function ContractFlowOverviewPage() {
  await requireAdmin();
  const [open, jobs] = await Promise.all([listOpenAcrossJobs(), listJobs({ activeOnly: true })]);
  const overdue = open.filter((d) => d.overdue);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">ContractFlow</h1>

      {overdue.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {overdue.length} RFI{overdue.length === 1 ? "" : "s"} overdue for a response.
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Awaiting response
        </h2>
        <p className="text-sm text-slate-600">
          Issued documents waiting on the Principal&apos;s representative. When the response
          arrives, record it to move the document to its final state.
        </p>
        {open.length === 0 ? (
          <p className="text-sm text-slate-600">No issued documents awaiting a response.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Response required</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {open.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Link
                        href={`/contractflow/${d.jobId}/doc/${d.id}`}
                        className="text-blue-700 underline"
                      >
                        {documentTitle(d)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {d.jobNumber} — {d.jobName}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      {d.overdue && (
                        <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatIsoDate(d.responseRequiredBy)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/contractflow/${d.jobId}/doc/${d.id}?respond=1`}
                        className="whitespace-nowrap text-blue-700 underline"
                      >
                        {d.kind === "nod" ? "Record acknowledgement" : "Record response"} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
