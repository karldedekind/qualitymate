import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractForm } from "@/app/contractflow/[jobId]/contract-form";
import { findJobById, listJobContractFiles } from "@/lib/jobs";
import { JobForm } from "../job-form";

export const dynamic = "force-dynamic";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job: jobId } = await searchParams;
  const job = jobId ? await findJobById(jobId) : null;
  if (jobId && !job) notFound();
  const contractFiles = job ? await listJobContractFiles(job.id) : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/admin/jobs" className="text-sm text-blue-700 hover:underline">
          ← All jobs
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New job</h1>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm max-w-2xl">
        {job ? (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-mono text-sm text-slate-500">{job.number}</p>
              <Link
                href={`/admin/jobs/${job.id}/edit`}
                className="text-sm text-blue-700 hover:underline"
              >
                Edit
              </Link>
            </div>
            <p className="text-lg font-medium">{job.name}</p>
            {job.address && <p className="text-sm text-slate-600">{job.address}</p>}
          </div>
        ) : (
          <JobForm mode="create" />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contract details
        </h2>
        {job ? (
          <ContractForm
            jobId={job.id}
            initial={{
              principalName: job.principalName ?? "",
              principalTradingAs: job.principalTradingAs ?? "",
              principalRepName: job.principalRepName ?? "",
              principalRepPhone: job.principalRepPhone ?? "",
              principalRepEmail: job.principalRepEmail ?? "",
              contractDateForPc: job.contractDateForPc ?? "",
              contractSumDollars:
                job.contractSumCents != null ? String(job.contractSumCents / 100) : "",
              dayBasis: job.dayBasis ?? "",
            }}
            files={contractFiles.map((f) => ({
              id: f.id,
              kind: f.kind,
              path: f.path,
              originalFilename: f.originalFilename,
            }))}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            Create the job above to unlock contract details — upload the LOA, PO and contract
            documents, then populate the fields with AI or enter them manually.
          </div>
        )}
      </section>

      {job && (
        <div>
          <Link
            href="/admin/jobs"
            className="inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
          >
            Done
          </Link>
        </div>
      )}
    </div>
  );
}
