"use client";

import { useState } from "react";
import { saveDefaultDistributionAction } from "../meetings/actions";

export function DistributionForm({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial.join("\n"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    formData.set("emails", value);
    const result = await saveDefaultDistributionAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <p className="text-xs text-slate-500">
        These addresses receive approved minutes for every meeting. Add per-meeting
        extras on each meeting&apos;s detail page. One per line — plain email or{" "}
        <span className="font-mono">Name &lt;email&gt;</span>.
      </p>
      <label className="block">
        <textarea
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={8000}
          placeholder={"board@example.com\nKarl Dedekind <karl@example.com>"}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
      </label>
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
