import { requireAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  await requireAdmin();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Diagnostics</h1>
        <p className="text-slate-600 text-sm mt-1">
          Generate a tarball with app version, sanitised env, Postgres
          statistics, and the most recent log lines. Send to RIM Construction
          when reporting issues. Each generation is recorded in the audit log.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-base font-medium">Bundle contents</h2>
        <ul className="text-sm list-disc pl-6 space-y-1 text-slate-700">
          <li><span className="font-mono">app-info.json</span> — version, Node runtime, instance id</li>
          <li><span className="font-mono">env-sanitised.txt</span> — env vars with secret-like names redacted</li>
          <li><span className="font-mono">pg-stats.json</span> — pg_stat_database, pg_stat_user_tables, connection count</li>
          <li><span className="font-mono">logs.txt</span> — last 5000 lines from <span className="font-mono">$LOG_FILE</span> (or default <span className="font-mono">/app/data/logs/app.log</span>)</li>
          <li><span className="font-mono">manifest.json</span> — file list and timestamp</li>
        </ul>
        <a
          href="/admin/diagnostics/download.tar.gz"
          className="inline-block rounded-md bg-blue-700 text-white px-4 py-2 font-medium"
        >
          Download diagnostics
        </a>
      </section>
    </div>
  );
}
