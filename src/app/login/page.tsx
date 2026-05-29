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
    </main>
  );
}
