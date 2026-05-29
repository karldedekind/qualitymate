"use client";

import { useState } from "react";

type Result = { ok: boolean; message: string };

export function TestHeartbeatButton({
  action,
}: {
  action: () => Promise<Result>;
}) {
  const [state, setState] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    setState(null);
    try {
      const result = await action();
      setState(result);
    } catch {
      setState({ ok: false, message: "Unexpected error." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-slate-300 px-4 py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send test heartbeat"}
      </button>
      {state && (
        <span
          className={`text-sm ${state.ok ? "text-green-700" : "text-red-700"}`}
        >
          {state.message}
        </span>
      )}
    </div>
  );
}
