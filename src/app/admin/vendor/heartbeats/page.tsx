import { requireAdmin } from "@/lib/auth-helpers";
import { listInstances, staleInstances } from "@/lib/heartbeat-receiver";
import { KNOWN_KEYS, get } from "@/lib/settings";
import { saveIngestTokenAction } from "@/app/admin/heartbeat/actions";

export const dynamic = "force-dynamic";

const STALE_HOURS = 1;

export default async function VendorHeartbeatsPage() {
  await requireAdmin();
  const [instances, stale, ingestToken] = await Promise.all([
    listInstances(),
    staleInstances(STALE_HOURS * 60 * 60 * 1000),
    get(KNOWN_KEYS.HEARTBEAT_INGEST_TOKEN),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vendor monitoring</h1>
        <p className="text-slate-600 text-sm mt-1">
          Lists every QualityMate install that has pinged this server. Instances
          that haven&apos;t reported in {STALE_HOURS}h appear in the alerts panel.
        </p>
      </div>

      <form action={saveIngestTokenAction} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm max-w-2xl space-y-3">
        <h2 className="text-base font-medium">Ingest token</h2>
        <p className="text-xs text-slate-500">
          Customer installs send heartbeats with <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>.
          Set or rotate it here. Empty value disables ingestion.
          {ingestToken ? " Token currently set." : " No token set — ingestion disabled."}
        </p>
        <input
          name="ingestToken"
          type="password"
          placeholder="Paste new token (or leave blank to clear)"
          autoComplete="off"
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium"
        >
          Save token
        </button>
      </form>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <h2 className="text-base font-medium mb-3">
          Stale (no ping in &gt;{STALE_HOURS}h)
        </h2>
        {stale.length === 0 ? (
          <p className="text-sm text-slate-600">All instances pinged recently.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {stale.map((s) => (
              <li
                key={s.instanceId}
                className="flex items-center justify-between border-l-4 border-red-500 pl-3 py-1"
              >
                <span className="font-mono">{s.companyName ?? s.instanceId}</span>
                <span className="text-red-700">
                  silent {s.staleHours.toFixed(1)}h · last {s.lastSeenAt.toISOString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <h2 className="text-base font-medium mb-3">All instances</h2>
        {instances.length === 0 ? (
          <p className="text-sm text-slate-600">
            No heartbeats received yet. Configure ingest token above and have a
            customer install enable heartbeats pointing at this server.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Instance</th>
                <th className="py-1">Version</th>
                <th className="py-1">Last seen</th>
                <th className="py-1">Age</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((i) => (
                <tr key={i.instanceId} className="border-t border-slate-100">
                  <td className="py-1 font-mono">
                    {i.companyName ?? i.instanceId}
                  </td>
                  <td className="py-1">{i.version ?? "—"}</td>
                  <td className="py-1">{i.lastSeenAt.toISOString()}</td>
                  <td
                    className={`py-1 ${i.staleHours > STALE_HOURS ? "text-red-700" : ""}`}
                  >
                    {i.staleHours.toFixed(1)}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
