import { requireUser } from "@/lib/auth-helpers";
import { isMfaEnabled } from "@/lib/mfa";
import { SecurityPanel } from "./panel";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const u = await requireUser({ skipMfa: true });
  const enabled = await isMfaEnabled(u.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account security</h1>
        <p className="text-slate-600 text-sm mt-1">
          Two-factor authentication adds a one-time code from your authenticator app
          to every sign-in.
        </p>
      </div>
      <SecurityPanel enabled={enabled} />
    </div>
  );
}
