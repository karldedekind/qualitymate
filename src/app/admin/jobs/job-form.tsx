"use client";

import { useState } from "react";
import type { Job } from "@/lib/jobs";
import { createJobAction, updateJobAction } from "./actions";

type Props =
  | { mode: "create"; job?: undefined }
  | { mode: "edit"; job: Job };

export function JobForm(props: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result =
      props.mode === "create" ? await createJobAction(formData) : await updateJobAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {props.mode === "edit" && <input type="hidden" name="id" value={props.job.id} />}

      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Job number</span>
        <input
          name="number"
          required
          defaultValue={props.mode === "edit" ? props.job.number : ""}
          placeholder="e.g. 2026-014"
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Name</span>
        <input
          name="name"
          required
          defaultValue={props.mode === "edit" ? props.job.name : ""}
          placeholder="e.g. Riverside Apartments — Stage 2"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Address (optional)</span>
        <input
          name="address"
          defaultValue={props.mode === "edit" ? (props.job.address ?? "") : ""}
          placeholder="e.g. 14 River St, Brisbane QLD 4000"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      {props.mode === "edit" && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={props.job.active} />
          <span className="text-sm text-slate-700">Active (shown in check-in dropdown)</span>
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : props.mode === "create" ? "Create job" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
