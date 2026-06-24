"use client";

import { useState } from "react";
import { assignJobAction } from "../../../incidents/actions";

export type JobOption = { id: string; number: string; name: string };

export function AssignJobPanel({ id, jobs }: { id: string; jobs: JobOption[] }) {
  const [jobId, setJobId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("id", id);
    fd.append("jobId", jobId);
    const result = await assignJobAction(fd);
    setPending(false);
    if (result?.error) setError(result.error);
    // On success the page revalidates and this panel disappears (job now set).
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
      <h2 className="text-base font-medium">Assign job</h2>
      <p className="text-sm text-slate-600">
        No job was recorded for this incident. You can add one now. Once set, it cannot be changed.
      </p>

      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No active jobs available.</p>
      ) : (
        <>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Job site</span>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.number} — {j.name}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={onSave}
            disabled={pending || !jobId}
            className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Assign job"}
          </button>
        </>
      )}
    </section>
  );
}
