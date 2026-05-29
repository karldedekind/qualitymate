import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { ChangePasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.deactivated) redirect("/login");

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold mb-1">Change password</h1>
      <p className="text-slate-600 text-sm mb-6">
        {u.mustChangePassword
          ? "An admin reset your password. Set a new one to continue."
          : "Pick a new password."}
      </p>
      <ChangePasswordForm />
    </main>
  );
}
