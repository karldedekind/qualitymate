"use client";

import { useState } from "react";

type State =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string };

export function DataExportDownloadButton() {
  const [state, setState] = useState<State>({ type: "idle" });

  async function handleDownload() {
    setState({ type: "loading" });
    try {
      const res = await fetch("/admin/data-export/download.zip");
      if (res.status === 429) {
        const json = await res.json();
        const mins = Math.ceil(json.retryAfterSeconds / 60);
        setState({
          type: "error",
          message: `Export limit reached. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
        });
        return;
      }
      if (!res.ok) {
        setState({ type: "error", message: "Export failed. Please try again." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qualitymate-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setState({ type: "idle" });
    } catch {
      setState({ type: "error", message: "Export failed. Please try again." });
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleDownload}
        disabled={state.type === "loading"}
        className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {state.type === "loading" ? "Preparing export…" : "Download export (ZIP)"}
      </button>
      {state.type === "error" && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {state.message}
        </div>
      )}
    </div>
  );
}
