"use client";

import { useState } from "react";
import { linkVariationAction } from "../../../actions";

type Option = { id: string; label: string };

export function LinkVariationForm({
  documentId,
  options,
  currentId,
  locked = false,
}: {
  documentId: string;
  options: Option[];
  currentId: string | null;
  /** Show the current link read-only; changing it needs an explicit, confirmed unlock. */
  locked?: boolean;
}) {
  const [value, setValue] = useState(currentId ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    setValue(next);
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("variationId", next);
    const result = await linkVariationAction(documentId, fd);
    setPending(false);
    setUnlocked(false);
    if (result?.error) setError(result.error);
  }

  if (locked && value && !unlocked) {
    const current = options.find((o) => o.id === value);
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{current?.label ?? "Linked variation"}</span>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "This variation was linked when the document was created. Change the linked variation?",
              )
            ) {
              setUnlocked(true);
            }
          }}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Change
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => void onChange(e.target.value)}
        className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
