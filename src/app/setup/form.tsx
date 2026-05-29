"use client";

import { useState } from "react";
import { completeSetupAction } from "./actions";

type Props = {
  initial: { companyName: string; companyShortName: string; primaryColor: string };
  recoveryToken: string | null;
};

export function SetupForm({ initial, recoveryToken }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await completeSetupAction(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
      {recoveryToken && (
        <input type="hidden" name="recoveryToken" value={recoveryToken} />
      )}

      <fieldset className="space-y-4">
        <legend className="text-lg font-medium">Company info</legend>
        <Field label="Company name" name="companyName" defaultValue={initial.companyName} required />
        <Field label="Short name" name="companyShortName" defaultValue={initial.companyShortName} required />
        <Field label="Primary colour" name="primaryColor" type="color" defaultValue={initial.primaryColor} required />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-medium">First admin account</legend>
        <Field label="Full name" name="adminName" required />
        <Field label="Email" name="adminEmail" type="email" required />
        <Field label="Password (min 8 chars)" name="adminPassword" type="password" required minLength={8} />
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-700 text-white py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Complete setup"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
