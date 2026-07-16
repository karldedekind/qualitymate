import { BrandedHeader } from "@/components/branded-header";
import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ContractFlowLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <BrandedHeader showSignOut />
        <div className="bg-indigo-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-semibold tracking-tight">ContractFlow</span>
              <span className="hidden sm:inline rounded-full border border-indigo-400/60 bg-indigo-900 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-indigo-200">
                Contract administration
              </span>
            </div>
            <Link
              href="/dashboard"
              className="shrink-0 text-sm text-indigo-200 hover:text-white transition-colors"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
      <main className="flex-1 mx-auto max-w-6xl px-4 py-6 w-full print:max-w-none print:px-0 print:py-0">
        {children}
      </main>
    </div>
  );
}
