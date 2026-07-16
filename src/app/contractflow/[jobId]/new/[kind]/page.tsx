import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
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
  // RFI only until ticket 04 adds the NOD and EOT kinds.
  if (kind !== "rfi") notFound();
  const job = await findJobById(jobId);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/contractflow/${jobId}`} className="text-sm text-blue-700 underline">
        ← {job.number} register
      </Link>
      <DocForm mode="create" jobId={jobId} kind={kind} />
    </div>
  );
}
