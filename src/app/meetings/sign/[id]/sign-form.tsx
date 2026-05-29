"use client";

import { useState } from "react";
import { signoffAction } from "./actions";

export function SignForm({
  meetingId,
  token,
  alreadySigned,
}: {
  meetingId: string;
  token: string;
  alreadySigned: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadySigned);
  const [confirmed, setConfirmed] = useState(false);

  if (done) {
    return (
      <p className="text-sm text-green-700">
        Thanks — your signoff is recorded. You can close this page.
      </p>
    );
  }

  async function onSubmit() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("id", meetingId);
    fd.append("token", token);
    const result = await signoffAction(fd);
    setPending(false);
    if (result?.error) setError(result.error);
    else setDone(true);
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1"
        />
        <span>
          I confirm the minutes above are an accurate record of the meeting.
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!confirmed || pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Saving…" : "Sign off"}
      </button>
    </div>
  );
}
