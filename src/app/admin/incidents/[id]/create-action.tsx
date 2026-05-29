"use client";

import { useState } from "react";
import { createActionAction } from "@/app/actions/actions";

type AssigneeOption = { id: string; name: string; email: string };

function defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  // datetime-local needs YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function CreateActionForm({
  incidentId,
  assignees,
}: {
  incidentId: string;
  assignees: AssigneeOption[];
}) {
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    formData.append("incidentId", incidentId);
    const result = await createActionAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else {
      setOk(true);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-700 text-white px-3 py-1.5 text-sm font-medium"
      >
        Add corrective action
      </button>
    );
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Title</span>
        <input
          name="title"
          required
          maxLength={200}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Description</span>
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Assignee</span>
          <select
            name="assigneeId"
            required
            defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>— pick a user —</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Deadline</span>
          <input
            type="datetime-local"
            name="deadline"
            required
            defaultValue={defaultDeadline()}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">Created.</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save action"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md bg-slate-200 text-slate-800 px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
