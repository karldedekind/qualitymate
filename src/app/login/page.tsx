import { redirect } from "next/navigation";
import { isLocked } from "@/lib/setup-state";
import { getBranding } from "@/lib/branding";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ reason?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  if (!(await isLocked())) {
    redirect("/setup");
  }
  const { reason, error } = await searchParams;
  const brand = await getBranding();
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="flex items-center gap-3 mb-6">
        {brand.logoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/uploads/${brand.logoPath}`} alt={brand.companyName} className="h-10 w-auto" />
        ) : (
          <div
            className="h-10 w-10 rounded-md flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {brand.companyShortName.charAt(0)}
          </div>
        )}
        <h1 className="text-2xl font-semibold">{brand.companyName}</h1>
      </div>
      <p className="text-slate-600 text-sm mb-4">Sign in to QualityMate</p>
      {reason === "expired" && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          You have been logged out. Please sign in again.
        </div>
      )}
      {error === "deactivated" && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          This account has been deactivated. Contact your administrator.
        </div>
      )}
      <LoginForm />

      <div className="mt-10 pt-6 border-t border-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">
          On site?
        </p>
        <a
          href="/checkin"
          className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: brand.primaryColor }}
            aria-hidden
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-slate-900">Subcontractor site sign-in</span>
            <span className="block text-sm text-slate-500">No account needed — sign in to a job site</span>
          </span>
          <span
            aria-hidden
            className="text-lg text-slate-400 transition group-hover:translate-x-0.5"
            style={{ color: brand.primaryColor }}
          >
            →
          </span>
        </a>
      </div>
    </main>
  );
}
