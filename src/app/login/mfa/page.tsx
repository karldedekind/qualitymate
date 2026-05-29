import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { MfaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!session.totpEnabled) redirect("/dashboard");
  if (session.mfaVerifiedAt) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold mb-2">Two-factor sign-in</h1>
      <p className="text-slate-600 text-sm mb-4">
        Enter the 6-digit code from your authenticator app, or one of your recovery codes.
      </p>
      <MfaForm />
    </main>
  );
}
