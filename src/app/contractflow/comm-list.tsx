import type { Communication } from "@/lib/communications";

/** Read-only communications register list, shared by the job and document pages. */
export function CommList({ comms, emptyText }: { comms: Communication[]; emptyText: string }) {
  if (comms.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {comms.map((c) => (
        <li key={c.id} className="px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                c.direction === "inbound"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {c.direction === "inbound" ? "In" : "Out"}
            </span>
            <span className="font-medium">{c.subject}</span>
            <span className="ml-auto text-slate-500">
              {c.occurredAt.toLocaleDateString("en-AU")}
            </span>
          </div>
          {c.note && <p className="mt-1 text-slate-600">{c.note}</p>}
          {c.path && (
            <a
              href={`/contractflow/file/${c.path}`}
              className="mt-1 inline-block text-blue-700 underline"
            >
              {c.originalFilename ?? "Attachment"}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
