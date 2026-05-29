"use client";

import { useState } from "react";
import { saveMfaRequiredAction } from "./mfa-actions";

export function MfaRequireForm({ initial }: { initial: boolean }) {
  const [pending, setPending] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setOk(false);
    setError(null);
    try {
      await saveMfaRequiredAction(formData);
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
    setPending(false);
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="require" value="true" defaultChecked={initial} />
        Require two-factor authentication for every admin account
      </label>
      <p className="text-xs text-slate-500">
        When enabled, admins without TOTP enrolled are sent through setup on their next sign-in.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
