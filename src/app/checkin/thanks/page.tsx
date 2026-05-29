import Link from "next/link";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function CheckInThanksPage() {
  const brand = await getBranding();

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

      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-12">
        <div className="bg-white border border-green-200 rounded-lg p-8 shadow-sm text-center">
          <div className="text-5xl mb-3">✓</div>
          <h1 className="text-2xl font-semibold mb-2">Signed in</h1>
          <p className="text-slate-600 mb-6">
            Thank you. Your sign-in has been recorded. Have a safe day on site.
          </p>
          <Link
            href="/checkin"
            className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Sign in another person
          </Link>
        </div>
      </main>
    </div>
  );
}
