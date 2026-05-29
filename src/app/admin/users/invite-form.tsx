"use client";

import { useState } from "react";
import { inviteUserAction } from "./actions";

export function InviteForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setLink(null);
    const result = await inviteUserAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else if (result?.link) {
      setLink(result.link);
      setInvitedEmail(result.email ?? null);
      setEmailSent(!!result.emailSent);
    }
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-sm text-slate-700 mb-1 block">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Role</span>
          <select
            name="role"
            defaultValue="site_staff"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="site_staff">site_staff</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {link && (
        <div className="bg-blue-50 border border-blue-300 rounded p-3 text-sm">
          <p className="text-blue-900 mb-1">
            Invitation created for <strong>{invitedEmail}</strong>.{" "}
            {emailSent ? "Email sent." : "SMTP unconfigured — copy the link below."}
          </p>
          <code className="block bg-white border border-blue-300 rounded px-2 py-1 font-mono text-xs break-all">
            {link}
          </code>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
    </form>
  );
}
