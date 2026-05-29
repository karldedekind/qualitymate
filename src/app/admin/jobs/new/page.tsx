import Link from "next/link";
import { JobForm } from "../job-form";

export const dynamic = "force-dynamic";

export default function NewJobPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/jobs" className="text-sm text-blue-700 hover:underline">
          ← All jobs
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New job</h1>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <JobForm mode="create" />
      </section>
    </div>
  );
}
