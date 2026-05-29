"use client";

import { useState } from "react";
import { saveDeclarationsAction } from "./actions";

type Declaration = { key: string; text: string };

export function DeclarationsForm({ initial }: { initial: Declaration[] }) {
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setSaved(false);
    setError(null);
    const result = await saveDeclarationsAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setSaved(true);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <p className="text-xs text-slate-500">
        Edit the eight declarations shown on the public site check-in form. Keep wording aligned
        with QLD WHS Regulation 2011.
      </p>
      <ol className="space-y-3 list-decimal pl-5">
        {initial.map((d) => (
          <li key={d.key}>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1 block font-mono">{d.key}</span>
              <textarea
                name={`decl.${d.key}`}
                defaultValue={d.text}
                rows={2}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </li>
        ))}
      </ol>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">Declarations saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save declarations"}
      </button>
    </form>
  );
}
