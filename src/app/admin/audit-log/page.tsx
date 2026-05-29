import Link from "next/link";
import { distinctEntityTypes, query } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; entity?: string }>;
};

function parseDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setUTCHours(23, 59, 59, 999);
  return d;
}

export default async function AuditLogPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = parseDate(sp.from);
  const to = parseDate(sp.to, true);
  const entityType = sp.entity || null;

  const types = await distinctEntityTypes();
  const events = await query({ from, to, entityType, limit: 500 });

  const exportQuery = new URLSearchParams();
  if (sp.from) exportQuery.set("from", sp.from);
  if (sp.to) exportQuery.set("to", sp.to);
  if (sp.entity) exportQuery.set("entity", sp.entity);
  const qs = exportQuery.toString() ? `?${exportQuery.toString()}` : "";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <div className="flex gap-3 text-sm">
          <a
            href={`/admin/audit-log/export.csv${qs}`}
            className="rounded-md bg-slate-800 text-white px-3 py-1.5"
          >
            Export CSV
          </a>
          <a
            href={`/admin/audit-log/export.pdf${qs}`}
            className="rounded-md bg-slate-800 text-white px-3 py-1.5"
          >
            Export PDF
          </a>
        </div>
      </div>

      <form className="bg-white border border-slate-200 rounded-lg p-4 grid sm:grid-cols-4 gap-3 text-sm">
        <label className="block">
          <span className="text-slate-600 mb-1 block">From</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-slate-600 mb-1 block">To</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-slate-600 mb-1 block">Entity type</span>
          <select
            name="entity"
            defaultValue={sp.entity ?? ""}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-blue-700 text-white px-3 py-1.5 w-full"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No events match the filters.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    {e.ts.toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-3 py-2">{e.userEmailSnapshot ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{e.action}</td>
                  <td className="px-3 py-2">
                    {e.entityId ? (
                      <Link
                        href={`/admin/audit-log/${e.entityType}/${encodeURIComponent(e.entityId)}`}
                        className="text-blue-700 underline"
                      >
                        {e.entityType}:{e.entityId}
                      </Link>
                    ) : (
                      e.entityType
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.ip ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {events.length === 500 && (
        <p className="text-xs text-slate-500">
          Showing 500 most recent events. Narrow the filter or export to see more.
        </p>
      )}
    </div>
  );
}
