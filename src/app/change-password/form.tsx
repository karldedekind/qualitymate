"use client";

import { useState } from "react";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await changePasswordAction(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Current password</span>
        <input
          name="currentPassword"
          type="password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">New password (min 8 chars)</span>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-700 text-white py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
