import { findInviteByToken } from "@/lib/users";
import { AcceptInviteForm } from "./form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = await params;
  const inv = await findInviteByToken(token);

  if (!inv || inv.usedAt || inv.expiresAt < new Date()) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-semibold mb-2">Invitation invalid</h1>
        <p className="text-slate-600">
          This invitation link is missing, expired, or already used. Ask an admin for a new invite.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold mb-1">Set up your account</h1>
      <p className="text-slate-600 text-sm mb-6">
        You were invited as <strong>{inv.email}</strong> ({inv.role}).
      </p>
      <AcceptInviteForm token={token} email={inv.email} />
    </main>
  );
}
