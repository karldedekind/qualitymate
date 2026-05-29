"use client";

import { useState } from "react";
import { saveManagementRepAction } from "./actions";

type Admin = { id: string; name: string; email: string };

export function ManagementRepForm({
  admins,
  currentId,
}: {
  admins: Admin[];
  currentId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    const result = await saveManagementRepAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Management representative</span>
        <select
          name="userId"
          defaultValue={currentId ?? ""}
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>Select an admin…</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
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
