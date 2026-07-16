import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { findJobById } from "@/lib/jobs";

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contractflow" className="text-sm text-blue-700 underline">
          ← All jobs
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {job.number} — {job.name}
        </h1>
      </div>
      <p className="text-sm text-slate-600">
        Contract register coming soon. RFIs, notices, EOTs, variations and communications for this
        job will live here.
      </p>
    </div>
  );
}
