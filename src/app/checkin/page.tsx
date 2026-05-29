import { getBranding } from "@/lib/branding";
import { listJobs } from "@/lib/jobs";
import { DECLARATION_KEYS, QLD_TRADES, getDeclarations } from "@/lib/checkin";
import { CheckInForm } from "./checkin-form";

export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  const [brand, jobs, decls] = await Promise.all([
    getBranding(),
    listJobs({ activeOnly: true }),
    getDeclarations(),
  ]);
  const declarations = DECLARATION_KEYS.map((k) => ({ name: k, label: decls[k] }));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {brand.companyShortName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{brand.companyName}</div>
            <div className="text-xs text-slate-500">Site sign-in</div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-6">
        <h1 className="text-2xl font-semibold mb-1">Sign in to site</h1>
        <p className="text-slate-600 text-sm mb-6">
          Complete this form before entering site. All fields are required.
        </p>

        {jobs.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-sm text-yellow-900">
            No active jobs. Please check with the site supervisor.
          </div>
        ) : (
          <CheckInForm
            jobs={jobs.map((j) => ({ id: j.id, number: j.number, name: j.name }))}
            trades={[...QLD_TRADES]}
            declarations={declarations}
          />
        )}
      </main>
    </div>
  );
}
