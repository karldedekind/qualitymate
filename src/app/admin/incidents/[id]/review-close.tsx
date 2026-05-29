"use client";

import { useState } from "react";
import { closeIncidentAction, reviewIncidentAction } from "../../../incidents/actions";

export function ReviewButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("id", id);
    const result = await reviewIncidentAction(fd);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Working…" : "Move to open"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

export function CloseForm({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await closeIncidentAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="reason"
        required
        rows={3}
        maxLength={2000}
        placeholder="Outcome / reason for closing"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Closing…" : "Close incident"}
      </button>
    </form>
  );
}
