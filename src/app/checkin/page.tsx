import { getBranding } from "@/lib/branding";
import { listJobs } from "@/lib/jobs";
import { DECLARATION_KEYS, QLD_TRADES, getDeclarations } from "@/lib/checkin";
import { CheckInForm } from "./checkin-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ job?: string }>;
};

export default async function CheckInPage({ searchParams }: Props) {
  const [{ job: jobParam }, brand, jobs, decls] = await Promise.all([
    searchParams,
    getBranding(),
    listJobs({ activeOnly: true }),
    getDeclarations(),
  ]);
  const declarations = DECLARATION_KEYS.map((k) => ({ name: k, label: decls[k] }));
  // Preselect the job from the poster QR (?job=…), but only if it's a real
  // active job; otherwise fall back to the blank "Select a job…" prompt.
  const selectedJobId = jobs.some((j) => j.id === jobParam) ? jobParam ?? "" : "";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          {brand.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/uploads/${brand.logoPath}`} alt={brand.companyName} className="h-9 w-auto" />
          ) : (
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center text-white font-semibold"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {brand.companyShortName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="font-semibold leading-tight">{brand.companyName}</div>
            <div className="text-xs text-slate-500">Site sign-in</div>
          </div>
          <a href="/login" className="text-xs text-slate-400 hover:text-slate-600 transition">
            Staff login
          </a>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-6">
        <div
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-6 border-l-4"
          style={{ borderLeftColor: brand.primaryColor }}
        >
          <h1 className="text-2xl font-semibold mb-1">Sign in to site</h1>
          <p className="text-slate-600 text-sm">
            Complete this form before entering site. All fields are required.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Takes about 2 minutes
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
              No account needed
            </span>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-sm text-yellow-900">
            No active jobs. Please check with the site supervisor.
          </div>
        ) : (
          <CheckInForm
            jobs={jobs.map((j) => ({ id: j.id, number: j.number, name: j.name }))}
            trades={[...QLD_TRADES]}
            declarations={declarations}
            selectedJobId={selectedJobId}
          />
        )}
      </main>
    </div>
  );
}
