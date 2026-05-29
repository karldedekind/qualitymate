"use client";

import { useRef, useState } from "react";
import { scheduleMeetingAction } from "../actions";

function defaultDt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleMeetingForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  async function onSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    const result = await scheduleMeetingAction(formData);
    submittingRef.current = false;
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Title</span>
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Q2 management review"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">When</span>
          <input
            type="datetime-local"
            name="scheduledAt"
            required
            defaultValue={defaultDt()}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Location</span>
          <input
            name="location"
            maxLength={200}
            placeholder="Office / Zoom URL"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">
          Attendees (one per line — &ldquo;Name &lt;email&gt;&rdquo; or just name)
        </span>
        <textarea
          name="attendees"
          rows={5}
          maxLength={4000}
          placeholder={"Jane Doe <jane@example.com>\nBob Smith"}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Saving…" : "Schedule"}
      </button>
    </form>
  );
}
