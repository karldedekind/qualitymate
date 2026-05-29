"use client";

import { useState } from "react";
import { clearAiKeyAction, saveAiKeyAction } from "./actions";

export function AiKeyForm({ hasKey }: { hasKey: boolean }) {
  const [pending, setPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    const result = await saveAiKeyAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  async function onClear() {
    if (!confirm("Remove the stored Anthropic key? AI suggestions will be disabled.")) return;
    setClearing(true);
    setError(null);
    setOk(false);
    await clearAiKeyAction();
    setClearing(false);
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <p className="text-sm text-slate-600">
        Status: {hasKey ? (
          <span className="text-green-700">Key stored (encrypted at rest).</span>
        ) : (
          <span className="text-slate-700">Not configured.</span>
        )}
      </p>

      <label className="block">
        <span className="text-sm text-slate-700 mb-1 block">
          Anthropic API key {hasKey ? "(paste a new key to replace)" : ""}
        </span>
        <input
          name="apiKey"
          type="password"
          placeholder="sk-ant-..."
          autoComplete="off"
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
        />
        <span className="text-xs text-slate-500 mt-1 block">
          Validated with a 1-token probe call before save. Invalid keys are not stored.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">Key validated and saved.</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Validating…" : "Validate and save"}
        </button>
        {hasKey && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearing}
            className="rounded-md bg-slate-200 text-slate-800 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {clearing ? "Clearing…" : "Remove key"}
          </button>
        )}
      </div>
    </form>
  );
}
