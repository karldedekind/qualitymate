"use client";

import { useState } from "react";
import { verifyMfaAction } from "./actions";

export function MfaForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await verifyMfaAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="space-y-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Authenticator code</span>
        <input
          name="code"
          autoComplete="one-time-code"
          inputMode="text"
          required
          autoFocus
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-700 text-white py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
