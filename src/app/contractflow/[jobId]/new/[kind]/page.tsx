import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { documentTitle, listForJob } from "@/lib/contract-documents";
import { findJobById } from "@/lib/jobs";
import { DocForm } from "../../doc-form";

export const dynamic = "force-dynamic";

export default async function NewDocPage({
  params,
}: {
  params: Promise<{ jobId: string; kind: string }>;
}) {
  await requireAdmin();
  const { jobId, kind } = await params;
  if (kind !== "rfi" && kind !== "nod" && kind !== "eot") notFound();
  const job = await findJobById(jobId);
  if (!job) notFound();

  const docs = await listForJob(jobId);
  const issued = docs.filter((d) => d.number != null);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/contractflow/${jobId}`} className="text-sm text-blue-700 underline">
        ← {job.number} register
      </Link>
      <DocForm
        mode="create"
        jobId={jobId}
        kind={kind}
        dayBasis={job.dayBasis}
        rfiOptions={issued.filter((d) => d.kind === "rfi").map((d) => ({ id: d.id, label: documentTitle(d) }))}
        nodOptions={issued.filter((d) => d.kind === "nod").map((d) => ({ id: d.id, label: documentTitle(d) }))}
      />
    </div>
  );
}
