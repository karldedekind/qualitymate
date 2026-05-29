import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { isMfaEnabled } from "@/lib/mfa";
import { SecurityPanel } from "../panel";

export const dynamic = "force-dynamic";

export default async function SetupGatePage() {
  const u = await requireUser({ skipMfa: true });
  if (await isMfaEnabled(u.id)) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Two-factor required</h1>
        <p className="text-slate-600 text-sm mt-1">
          An admin policy requires every administrator to enable two-factor authentication.
          Set it up below to continue.
        </p>
      </div>
      <SecurityPanel enabled={false} />
    </div>
  );
}
