import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { documentTitle, findById, listVersions } from "@/lib/contract-documents";
import { findJobById } from "@/lib/jobs";
import { STATUS_CLASS, STATUS_LABEL, formatIsoDate } from "../../../format";
import { DocActions } from "./doc-actions";

export const dynamic = "force-dynamic";

const CONTENT_LABELS: Record<string, string> = {
  question: "Question",
  cause: "The cause of delay",
  datesOccurred: "Date(s) on which it occurred",
  daysDelayed: "Number of days delayed",
  clausePreamble: "Contractual basis of claim",
  reasons: "Reason(s) for delay",
  request: "Request",
};

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ jobId: string; docId: string }>;
}) {
  await requireAdmin();
  const { jobId, docId } = await params;
  const [job, doc] = await Promise.all([findJobById(jobId), findById(docId)]);
  if (!job || !doc || doc.jobId !== jobId) notFound();

  const versions = await listVersions(docId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/contractflow/${jobId}`} className="text-sm text-blue-700 underline">
          ← {job.number} register
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{documentTitle(doc)}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[doc.status]}`}>
            {STATUS_LABEL[doc.status]}
          </span>
          {doc.currentVersion > 0 && (
            <span className="text-sm text-slate-500">V{doc.currentVersion}</span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {job.number} — {job.name}
        </p>
      </div>

      {doc.status === "issued" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {doc.kind === "nod"
            ? "Awaiting acknowledgement from the Principal's representative"
            : "Awaiting a response from the Principal's representative"}
          {doc.kind === "rfi" && doc.responseRequiredBy
            ? ` (required by ${formatIsoDate(doc.responseRequiredBy)})`
            : ""}
          .
        </div>
      )}

      <DocActions documentId={docId} jobId={jobId} kind={doc.kind} status={doc.status} />

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        {Object.entries(doc.content)
          .filter(([, v]) => typeof v === "string" && v.trim() !== "")
          .map(([key, value]) => (
            <div key={key}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {CONTENT_LABELS[key] ?? key}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
            </div>
          ))}
        <dl className="grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
          {doc.kind === "rfi" && (
            <div>
              <dt className="text-slate-500">Response required by</dt>
              <dd>{formatIsoDate(doc.responseRequiredBy)}</dd>
            </div>
          )}
          {doc.kind === "eot" && (
            <>
              <div>
                <dt className="text-slate-500">
                  Days claimed ({job.dayBasis === "ordinary" ? "ordinary days" : "working days"})
                </dt>
                <dd>{doc.daysClaimed ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Date for PC at claim</dt>
                <dd>{formatIsoDate(doc.pcDateSnapshot)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Previous EOT days</dt>
                <dd>{doc.previousEotDays ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Adjusted Date for PC</dt>
                <dd>{formatIsoDate(doc.adjustedPcDate)}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Versions</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-slate-500">Not yet issued.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {[...versions].reverse().map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2">
                <span className="font-medium">V{v.version}</span>
                <span className="text-slate-500">
                  Issued {v.issuedAt.toLocaleDateString("en-AU")}
                </span>
                {v.supersededAt ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Archived
                  </span>
                ) : (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                    Current
                  </span>
                )}
                <span className="ml-auto">
                  <a href={`/contractflow/file/${v.pdfPath}`} className="text-blue-700 underline">
                    PDF
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
