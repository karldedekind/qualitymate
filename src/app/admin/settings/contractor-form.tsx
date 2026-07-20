"use client";

import { useState } from "react";
import { saveContractorAction } from "./actions";

type Initial = { legalName: string; phone: string; email: string };

export function ContractorForm({ initial }: { initial: Initial }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    const result = await saveContractorAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">Legal entity name</span>
        <input
          name="legalName"
          defaultValue={initial.legalName}
          placeholder="e.g. Dedekind Pty Ltd"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Phone</span>
          <input
            name="phone"
            defaultValue={initial.phone}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Email</span>
          <input
            name="email"
            type="email"
            defaultValue={initial.email}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Printed in the &ldquo;From the Contractor&rdquo; block of issued RFIs, NODs, and EOTs.
        The email also tells the AI email reader which party is the contractor.
      </p>

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
