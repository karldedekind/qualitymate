"use client";

import { useState } from "react";
import { runBackupNowAction } from "./actions";

export function BackupActionsPanel() {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRun() {
    setPending(true);
    setMsg(null);
    setError(null);
    const r = await runBackupNowAction();
    setPending(false);
    if (r?.error) setError(r.error);
    else if (r?.ok) {
      setMsg(
        `Wrote ${r.file} (${(r.bytes / 1024 / 1024).toFixed(1)} MB)` +
          (r.s3Key ? `; pushed to S3 as ${r.s3Key}` : ""),
      );
      if (typeof window !== "undefined") window.location.reload();
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
      <h2 className="text-base font-medium">Manual backup</h2>
      <p className="text-sm text-slate-600">
        Triggers the same flow as the nightly cron. Streams a tarball (database + uploads)
        into the backups directory and pushes offsite when S3 is configured.
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Running…" : "Run backup now"}
      </button>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
