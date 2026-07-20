import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  type ContractDocument,
  currentAdjustedPcDate,
  documentTitle,
  listForJob,
} from "@/lib/contract-documents";
import { listCommunicationsForJob } from "@/lib/communications";
import { findJobById, listJobContractFiles } from "@/lib/jobs";
import {
  contractSumSummary,
  listVariationFilesForJob,
  listVariationsForJob,
} from "@/lib/variations";
import { CollapsibleSection } from "../collapsible";
import { CommList } from "../comm-list";
import { STATUS_CLASS, STATUS_LABEL, formatIsoDate, formatMoney } from "../format";
import { CommForm } from "./comm-form";
import { ContractForm } from "./contract-form";
import { VariationsPanel } from "./variations-panel";

export const dynamic = "force-dynamic";

function isOverdue(d: ContractDocument): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return (
    d.kind === "rfi" &&
    d.status === "issued" &&
    d.responseRequiredBy != null &&
    d.responseRequiredBy < today
  );
}

function DocTable({ jobId, docs, title }: { jobId: string; docs: ContractDocument[]; title: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">None yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Key date</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{documentTitle(d)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[d.status]}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                    {isOverdue(d) && (
                      <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{d.currentVersion === 0 ? "—" : `V${d.currentVersion}`}</td>
                  <td className="px-3 py-2">
                    {d.kind === "rfi"
                      ? formatIsoDate(d.responseRequiredBy)
                      : d.kind === "eot"
                        ? formatIsoDate(d.adjustedPcDate)
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/contractflow/${jobId}/doc/${d.id}`}
                      className="text-blue-700 underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function JobRegisterPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  await requireAdmin();
  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) notFound();

  const [contractFiles, docs, adjustedPc, variations, variationFiles, sums, comms] =
    await Promise.all([
      listJobContractFiles(jobId),
      listForJob(jobId),
      currentAdjustedPcDate(jobId),
      listVariationsForJob(jobId),
      listVariationFilesForJob(jobId),
      contractSumSummary(jobId),
      listCommunicationsForJob(jobId),
    ]);
  const issuedDocs = docs.filter((d) => d.currentVersion > 0);
  const rfis = docs.filter((d) => d.kind === "rfi");
  const nods = docs.filter((d) => d.kind === "nod");
  const eots = docs.filter((d) => d.kind === "eot");

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
          <p className="mt-1 text-lg font-semibold">{formatMoney(sums.currentCents)}</p>
          <p className="text-xs text-slate-500">
            Original {formatMoney(sums.originalCents)} · Variations{" "}
            {formatMoney(sums.approvedVariationsCents)}
          </p>
        </div>
      </section>

      <CollapsibleSection
        title="Register"
        collapsible={false}
        tone="accent"
        actions={(["rfi", "nod", "eot"] as const).map((k) => (
          <Link
            key={k}
            href={`/contractflow/${jobId}/new/${k}`}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            New {k.toUpperCase()}
          </Link>
        ))}
      >
        <DocTable jobId={jobId} docs={rfis} title="Requests for Information" />
        <DocTable jobId={jobId} docs={nods} title="Notices of Delay" />
        <DocTable jobId={jobId} docs={eots} title="Extensions of Time" />
      </CollapsibleSection>

      <VariationsPanel
        jobId={jobId}
        variations={variations}
        files={variationFiles.map((f) => ({
          id: f.id,
          variationId: f.variationId,
          path: f.path,
          originalFilename: f.originalFilename,
        }))}
      />

      <CollapsibleSection title="Communications" badge={comms.length > 0 ? String(comms.length) : undefined}>
        <CommForm
          jobId={jobId}
          documents={issuedDocs.map((d) => ({ id: d.id, label: documentTitle(d) }))}
        />
        <CommList comms={comms} emptyText="No communications logged." />
      </CollapsibleSection>

      <CollapsibleSection title="Contract details">
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
      </CollapsibleSection>
    </div>
  );
}
