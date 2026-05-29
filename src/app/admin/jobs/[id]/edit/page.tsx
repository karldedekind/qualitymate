import Link from "next/link";
import { notFound } from "next/navigation";
import { findJobById } from "@/lib/jobs";
import { JobForm } from "../../job-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditJobPage({ params }: Props) {
  const { id } = await params;
  const job = await findJobById(id);
  if (!job) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/jobs" className="text-sm text-blue-700 hover:underline">
          ← All jobs
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Edit job</h1>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <JobForm mode="edit" job={job} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-2">
        <h2 className="text-base font-medium">Site sign-in poster</h2>
        <p className="text-sm text-slate-600">
          A4 PDF with company branding, job details, and a scannable QR linking to{" "}
          <code>/checkin?job={job.id}</code>. Print and stick on the gate.
        </p>
        <a
          href={`/admin/jobs/${job.id}/poster.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium"
        >
          Print QR poster (PDF)
        </a>
      </section>
    </div>
  );
}
