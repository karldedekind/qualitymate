import Link from "next/link";
import { BrandedHeader } from "@/components/branded-header";
import { requireUser } from "@/lib/auth-helpers";
import { listJobs } from "@/lib/jobs";
import { NewIncidentForm } from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewIncidentPage() {
  await requireUser();
  const jobs = await listJobs({ activeOnly: true });

  return (
    <div className="min-h-screen flex flex-col">
      <BrandedHeader showSignOut />
      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-6 space-y-4">
        <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">File an incident</h1>
        <p className="text-slate-600 text-sm">
          Describe what happened. Attach photos from your camera or gallery. Admin will review.
        </p>
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <NewIncidentForm jobs={jobs.map((j) => ({ id: j.id, number: j.number, name: j.name }))} />
        </section>
      </main>
    </div>
  );
}
