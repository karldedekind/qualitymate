import { BrandedHeader } from "@/components/branded-header";
import { requireCapability } from "@/lib/auth-helpers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CompanyRegistersLayout({ children }: { children: React.ReactNode }) {
  await requireCapability("documents.view");
  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <BrandedHeader showSignOut />
        <div className="bg-lime-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center justify-between gap-3">
            <Link href="/registers" className="font-semibold tracking-tight min-w-0 truncate">
              Company Registers
            </Link>
            <Link
              href="/dashboard"
              className="shrink-0 text-sm text-lime-200 hover:text-white transition-colors"
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
