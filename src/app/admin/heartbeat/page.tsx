import { requireAdmin } from "@/lib/auth-helpers";
import { getOrCreateInstanceId } from "@/lib/heartbeat";
import { KNOWN_KEYS, get } from "@/lib/settings";
import {
  saveHeartbeatAction,
  sendTestHeartbeatAction,
} from "./actions";
import { TestHeartbeatButton } from "./test-heartbeat-button";

export const dynamic = "force-dynamic";

export default async function HeartbeatPage() {
  await requireAdmin();
  const [enabled, endpoint, includeCompany, lastAt, instanceId] = await Promise.all([
    get(KNOWN_KEYS.HEARTBEAT_ENABLED),
    get(KNOWN_KEYS.HEARTBEAT_ENDPOINT),
    get(KNOWN_KEYS.HEARTBEAT_INCLUDE_COMPANY_NAME),
    get(KNOWN_KEYS.HEARTBEAT_LAST_AT),
    getOrCreateInstanceId(),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Heartbeat</h1>
        <p className="text-slate-600 text-sm mt-1">
          Optional hourly ping to RIM Construction so we can spot stuck instances
          and prioritise outage response. No PII, no incident text. Off by default.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-base font-medium">Payload sent (when enabled)</h2>
        <ul className="text-sm list-disc pl-6 text-slate-700 space-y-1">
          <li><span className="font-mono">instance_id</span> — random UUID, persisted on this install</li>
          <li><span className="font-mono">version</span> — app version</li>
          <li><span className="font-mono">uptime_seconds</span> — process uptime</li>
          <li><span className="font-mono">user_count</span> — total accounts</li>
          <li><span className="font-mono">incident_count_30d</span> — incidents created in last 30 days</li>
          <li><span className="font-mono">error_count_24h</span> — audit-log errors in last 24 hours</li>
          <li><span className="font-mono">company_name</span> — only if you opt in below</li>
        </ul>
        <p className="text-xs text-slate-500">
          Instance ID: <span className="font-mono">{instanceId}</span>
          {lastAt && (
            <>
              {" · "}Last sent: <span className="font-mono">{lastAt}</span>
            </>
          )}
        </p>
      </section>

      <form action={saveHeartbeatAction} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled === "true"}
          />
          <span className="text-sm">Enable hourly heartbeat</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="includeCompanyName"
            defaultChecked={includeCompany === "true"}
          />
          <span className="text-sm">Include company name in heartbeat</span>
        </label>

        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Endpoint URL</span>
          <input
            name="endpoint"
            type="text"
            defaultValue={endpoint ?? ""}
            placeholder="https://heartbeats.qualitymate.com.au/api/heartbeats/ingest"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Bearer token (leave blank to keep existing)</span>
          <input
            name="token"
            type="password"
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium"
          >
            Save
          </button>
          <TestHeartbeatButton action={sendTestHeartbeatAction} />
        </div>
      </form>
    </div>
  );
}
