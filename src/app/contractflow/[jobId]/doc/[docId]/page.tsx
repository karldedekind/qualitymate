import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth-helpers";
import { listCommunicationsForDocument } from "@/lib/communications";
import {
  documentTitle,
  findById,
  listDocFiles,
  listForJob,
  listVersions,
} from "@/lib/contract-documents";
import { findJobById } from "@/lib/jobs";
import { listVariationsForJob } from "@/lib/variations";
import { CommList } from "../../../comm-list";
import { CommForm } from "../../comm-form";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  formatIsoDate,
  formatMoney,
  variationTitle,
} from "../../../format";
import { DocActions } from "./doc-actions";
import { LinkVariationForm } from "./link-variation-form";

export const dynamic = "force-dynamic";

const VARIATION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

const VARIATION_STATUS_CLASS: Record<string, string> = {
  proposed: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

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
  searchParams,
}: {
  params: Promise<{ jobId: string; docId: string }>;
  searchParams: Promise<{ respond?: string }>;
}) {
  await requireCapability("contractflow.manage");
  const [{ jobId, docId }, { respond }] = await Promise.all([params, searchParams]);
  const [job, doc] = await Promise.all([findJobById(jobId), findById(docId)]);
  if (!job || !doc || doc.jobId !== jobId) notFound();

  const [versions, files, variations, jobDocs, comms] = await Promise.all([
    listVersions(docId),
    listDocFiles(docId),
    listVariationsForJob(jobId),
    listForJob(jobId),
    listCommunicationsForDocument(docId),
  ]);
  const linkedVariation = variations.find((v) => v.id === doc.variationId) ?? null;
  const linkedNods = jobDocs.filter((d) => d.kind === "nod" && d.rfiId === docId);
  const linkedEots = jobDocs.filter((d) => d.kind === "eot" && d.nodId === docId);
  const linkedRfi = jobDocs.find((d) => d.id === doc.rfiId) ?? null;
  const linkedNod = jobDocs.find((d) => d.id === doc.nodId) ?? null;
  const photos = files.filter((f) => f.role === "photo");
  const attachments = files.filter((f) => f.role === "attachment");
  const responses = files.filter((f) => f.role === "response");

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
          Awaiting {doc.kind === "nod" ? "acknowledgement" : "a response"} from the
          Principal&apos;s representative
          {doc.kind === "rfi" && doc.responseRequiredBy
            ? ` (required by ${formatIsoDate(doc.responseRequiredBy)})`
            : ""}
          . Use <span className="font-medium">
            {doc.kind === "nod" ? "Record acknowledgement" : "Record response"}
          </span>{" "}
          below once it arrives.
        </div>
      )}

      <DocActions
        documentId={docId}
        jobId={jobId}
        kind={doc.kind}
        status={doc.status}
        initialShowResponse={respond === "1"}
      />

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
          {doc.respondedAt && (
            <div>
              <dt className="text-slate-500">
                {doc.kind === "nod" ? "Acknowledged" : "Response recorded"}
              </dt>
              <dd>{doc.respondedAt.toLocaleDateString("en-AU")}</dd>
            </div>
          )}
          {doc.responseNote && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Response note</dt>
              <dd>{doc.responseNote}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Linked documents
        </h2>

        {doc.kind === "nod" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              RFI reference
            </p>
            {linkedRfi ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/contractflow/${jobId}/doc/${linkedRfi.id}`}
                    className="font-medium text-blue-700 underline"
                  >
                    {documentTitle(linkedRfi)}
                  </Link>
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[linkedRfi.status]}`}>
                    {STATUS_LABEL[linkedRfi.status]}
                  </span>
                </div>
                {linkedRfi.content.question && (
                  <p className="mt-1 line-clamp-2 text-slate-700">{linkedRfi.content.question}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No RFI linked.</p>
            )}
          </div>
        )}

        {doc.kind === "eot" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              NOD reference
            </p>
            {linkedNod ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/contractflow/${jobId}/doc/${linkedNod.id}`}
                    className="font-medium text-blue-700 underline"
                  >
                    {documentTitle(linkedNod)}
                  </Link>
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[linkedNod.status]}`}>
                    {STATUS_LABEL[linkedNod.status]}
                  </span>
                  {linkedNod.content.daysDelayed && (
                    <span className="text-xs text-slate-500">
                      Days delayed: {linkedNod.content.daysDelayed}
                    </span>
                  )}
                </div>
                {linkedNod.content.cause && (
                  <p className="mt-1 line-clamp-2 text-slate-700">{linkedNod.content.cause}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No NOD linked.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Variation
            </p>
            <LinkVariationForm
              documentId={docId}
              currentId={doc.variationId}
              locked={doc.kind !== "rfi"}
              options={variations.map((v) => ({
                id: v.id,
                label: `${variationTitle(v)} — ${v.description.slice(0, 60)}`,
              }))}
            />
            {linkedVariation && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{variationTitle(linkedVariation)}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${VARIATION_STATUS_CLASS[linkedVariation.status]}`}
                  >
                    {VARIATION_STATUS_LABEL[linkedVariation.status]}
                  </span>
                </div>
                <p className="mt-1 text-slate-700">{linkedVariation.description}</p>
                <dl className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Claimed value (ex. GST)</dt>
                    <dd>{formatMoney(linkedVariation.claimedValueCents)}</dd>
                  </div>
                  {linkedVariation.status === "approved" && (
                    <div>
                      <dt className="text-slate-500">Approved value (ex. GST)</dt>
                      <dd>{formatMoney(linkedVariation.approvedValueCents)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-slate-500">Time impact (days)</dt>
                    <dd>{linkedVariation.timeImpactDays ?? "—"}</dd>
                  </div>
                  {linkedVariation.decidedAt && (
                    <div>
                      <dt className="text-slate-500">Decided</dt>
                      <dd>{linkedVariation.decidedAt.toLocaleDateString("en-AU")}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>

        {doc.kind === "rfi" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notices of Delay
            </p>
            {linkedNods.length === 0 ? (
              <p className="text-sm text-slate-500">No NOD references this RFI.</p>
            ) : (
              <ul className="space-y-2">
                {linkedNods.map((n) => (
                  <li key={n.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contractflow/${jobId}/doc/${n.id}`}
                        className="font-medium text-blue-700 underline"
                      >
                        {documentTitle(n)}
                      </Link>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[n.status]}`}>
                        {STATUS_LABEL[n.status]}
                      </span>
                      {n.content.daysDelayed && (
                        <span className="text-xs text-slate-500">
                          Days delayed: {n.content.daysDelayed}
                        </span>
                      )}
                    </div>
                    {n.content.cause && (
                      <p className="mt-1 line-clamp-2 text-slate-700">{n.content.cause}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {doc.kind === "nod" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Extensions of Time
            </p>
            {linkedEots.length === 0 ? (
              <p className="text-sm text-slate-500">No EOT references this NOD.</p>
            ) : (
              <ul className="space-y-2">
                {linkedEots.map((e) => (
                  <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contractflow/${jobId}/doc/${e.id}`}
                        className="font-medium text-blue-700 underline"
                      >
                        {documentTitle(e)}
                      </Link>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[e.status]}`}>
                        {STATUS_LABEL[e.status]}
                      </span>
                      {e.daysClaimed != null && (
                        <span className="text-xs text-slate-500">
                          Days claimed: {e.daysClaimed}
                        </span>
                      )}
                      {e.adjustedPcDate && (
                        <span className="text-xs text-slate-500">
                          Adjusted PC: {formatIsoDate(e.adjustedPcDate)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {photos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Photos</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((f) => (
              <li key={f.id}>
                <a
                  href={`/contractflow/file/${f.path}`}
                  target="_blank"
                  className="block overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/contractflow/file/${f.path}`}
                    alt={f.originalFilename}
                    className="h-32 w-full object-cover"
                  />
                  <span className="block truncate px-2 py-1 text-xs text-slate-600">
                    {f.originalFilename}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attachments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Documents
          </h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {attachments.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-4 py-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  Attachment
                </span>
                <a href={`/contractflow/file/${f.path}`} className="text-blue-700 underline">
                  {f.originalFilename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {responses.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Principal&apos;s response
          </h2>
          <ul className="divide-y divide-green-100 rounded-lg border border-green-200 bg-green-50 text-sm">
            {responses.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-4 py-2">
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                  Response
                </span>
                <a href={`/contractflow/file/${f.path}`} className="text-blue-700 underline">
                  {f.originalFilename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.currentVersion > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Communications
          </h2>
          <p className="text-sm text-slate-600">
            Correspondence about {documentTitle(doc)} — logged here, it also appears in the
            job&apos;s register.
          </p>
          <CommForm jobId={jobId} documents={[]} fixedDocumentId={docId} />
          <CommList comms={comms} emptyText="No communications logged for this document." />
        </section>
      )}

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
