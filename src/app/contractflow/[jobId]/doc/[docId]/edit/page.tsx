import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { documentTitle, findById, listForJob } from "@/lib/contract-documents";
import { findJobById } from "@/lib/jobs";
import { DocForm } from "../../../doc-form";

export const dynamic = "force-dynamic";

export default async function EditDocPage({
  params,
}: {
  params: Promise<{ jobId: string; docId: string }>;
}) {
  await requireAdmin();
  const { jobId, docId } = await params;
  const [job, doc] = await Promise.all([findJobById(jobId), findById(docId)]);
  if (!job || !doc || doc.jobId !== jobId) notFound();
  if (doc.status !== "draft") redirect(`/contractflow/${jobId}/doc/${docId}`);

  const docs = await listForJob(jobId);
  const issued = docs.filter((d) => d.number != null && d.id !== docId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/contractflow/${jobId}/doc/${docId}`}
        className="text-sm text-blue-700 underline"
      >
        ← {documentTitle(doc)}
      </Link>
      <DocForm
        mode="edit"
        documentId={docId}
        jobId={jobId}
        kind={doc.kind}
        dayBasis={job.dayBasis}
        initial={{
          content: doc.content,
          responseRequiredBy: doc.responseRequiredBy,
          daysClaimed: doc.daysClaimed,
          adjustedPcDate: doc.adjustedPcDate,
          rfiId: doc.rfiId,
          nodId: doc.nodId,
        }}
        rfiOptions={issued.filter((d) => d.kind === "rfi").map((d) => ({ id: d.id, label: documentTitle(d) }))}
        nodOptions={issued.filter((d) => d.kind === "nod").map((d) => ({ id: d.id, label: documentTitle(d) }))}
      />
    </div>
  );
}
