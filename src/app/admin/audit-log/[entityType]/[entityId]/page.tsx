import Link from "next/link";
import { history } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ entityType: string; entityId: string }>;
};

export default async function EntityHistoryPage({ params }: Props) {
  const { entityType, entityId } = await params;
  const decodedId = decodeURIComponent(entityId);
  const events = await history(entityType, decodedId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/audit-log" className="text-sm text-blue-700 underline">
          ← Audit log
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">
        History — <span className="font-mono text-base">{entityType}:{decodedId}</span>
      </h1>

      {events.length === 0 ? (
        <p className="text-slate-500">No events recorded for this entity.</p>
      ) : (
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-sm">{e.action}</span>
                  <span className="text-slate-500 text-sm ml-2">
                    by {e.userEmailSnapshot ?? "(anonymous)"}
                  </span>
                </div>
                <time className="text-xs text-slate-500 font-mono whitespace-nowrap">
                  {e.ts.toISOString().replace("T", " ").slice(0, 19)}
                </time>
              </div>
              {(e.before != null || e.after != null) && (
                <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 mb-1">Before</div>
                    <pre className="bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">
                      {e.before == null ? "—" : JSON.stringify(e.before, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-1">After</div>
                    <pre className="bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">
                      {e.after == null ? "—" : JSON.stringify(e.after, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              <div className="mt-2 text-xs text-slate-500">
                IP {e.ip ?? "—"} · {e.userAgent ?? "—"}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
