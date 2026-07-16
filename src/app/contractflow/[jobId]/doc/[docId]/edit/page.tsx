import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { documentTitle, findById } from "@/lib/contract-documents";
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
  // RFI only until ticket 04 adds the NOD and EOT kinds.
  if (doc.kind !== "rfi") notFound();

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
        initial={{
          content: doc.content,
          responseRequiredBy: doc.responseRequiredBy,
        }}
      />
    </div>
  );
}
