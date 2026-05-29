"use client";

import { useState } from "react";
import { rotateSupervisorTokenAction } from "./actions";

export function RotateTokenButton({
  jobId,
  tokenAlreadySet,
}: {
  jobId: string;
  tokenAlreadySet: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function rotate() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("jobId", jobId);
    const result = await rotateSupervisorTokenAction(fd);
    setPending(false);
    setConfirming(false);
    if ("error" in result) setError(result.error);
    else setUrl(result.url);
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600">
        Status: {tokenAlreadySet ? "token active (URL exists, not shown again)" : "no token yet"}
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {tokenAlreadySet ? "Rotate supervisor URL" : "Generate supervisor URL"}
        </button>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-700">
            {tokenAlreadySet
              ? "Rotating invalidates the existing link. Continue?"
              : "Generate a token-protected URL?"}
          </span>
          <button
            type="button"
            onClick={rotate}
            disabled={pending}
            className="rounded-md bg-blue-700 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            {pending ? "Working…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {url && (
        <div className="bg-blue-50 border border-blue-300 rounded-md p-3 text-xs space-y-1">
          <p className="text-blue-900">
            Copy this URL now — the token is not shown again.
          </p>
          <code className="block bg-white border border-blue-300 rounded px-2 py-1 font-mono break-all">
            {url}
          </code>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
