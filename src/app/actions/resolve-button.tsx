"use client";

import { useRef, useState } from "react";
import { resolveActionAction } from "./actions";

export function ResolveButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    formData.append("id", id);
    const result = await resolveActionAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-green-700 text-white px-3 py-1.5 text-sm font-medium"
      >
        Mark resolved
      </button>
    );
  }

  return (
    <form action={onSubmit} className="space-y-2 w-72">
      <textarea
        name="note"
        rows={2}
        maxLength={2000}
        placeholder="Resolution note (optional)"
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <div>
        <input
          ref={photoRef}
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
        />
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          {photoName ? `📎 ${photoName}` : "Attach photo (optional)"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-green-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setPhotoName(null); }}
          className="rounded-md bg-slate-200 text-slate-800 px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
