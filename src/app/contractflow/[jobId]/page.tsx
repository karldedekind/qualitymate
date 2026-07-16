import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { findJobById, listJobContractFiles } from "@/lib/jobs";
import { formatIsoDate, formatMoney } from "../format";
import { ContractForm } from "./contract-form";

export const dynamic = "force-dynamic";

export default async function JobRegisterPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  await requireAdmin();
  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) notFound();

  const contractFiles = await listJobContractFiles(jobId);
  // Until EOTs exist (ticket 04) the adjusted Date for PC equals the contract
  // date; until variations exist (ticket 08) the current sum is the original.
  const adjustedPc = job.contractDateForPc;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/contractflow" className="text-sm text-blue-700 underline">
          ← ContractFlow
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {job.number} — {job.name}
        </h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Date for PC (contract)</p>
          <p className="mt-1 text-lg font-semibold">{formatIsoDate(job.contractDateForPc)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current adjusted Date for PC</p>
          <p className="mt-1 text-lg font-semibold">{formatIsoDate(adjustedPc)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Current contract sum (ex. GST)
          </p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(job.contractSumCents)}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contract details
        </h2>
        <ContractForm
          jobId={jobId}
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
      </section>
    </div>
  );
}
