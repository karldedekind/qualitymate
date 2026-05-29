import Link from "next/link";
import { findJobById, listJobs } from "@/lib/jobs";
import {
  countCurrentlyOnSite,
  filterRows,
  hasSupervisorToken,
  listForJob,
  todayIsoUtc,
  whiteCardStatus,
} from "@/lib/roster";
import { LocalTime } from "@/components/local-time";
import { RotateTokenButton } from "./rotate-token-button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  job?: string;
  date?: string;
  trade?: string;
  company?: string;
  print?: string;
}>;

export default async function AdminRosterPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const jobs = await listJobs();
  const date = sp.date || todayIsoUtc();
  const jobId = sp.job || jobs.find((j) => j.active)?.id || "";
  const job = jobId ? await findJobById(jobId) : null;
  const isPrint = sp.print === "1";

  const allRows = job ? await listForJob(job.id, date) : [];
  const rows = filterRows(allRows, { trade: sp.trade, company: sp.company });
  const trades = Array.from(new Set(allRows.map((r) => r.trade))).sort();
  const onSite = countCurrentlyOnSite(rows);
  const tokenSet = job ? await hasSupervisorToken(job.id) : false;

  const csvParams = new URLSearchParams();
  if (job) csvParams.set("job", job.id);
  csvParams.set("date", date);
  if (sp.trade) csvParams.set("trade", sp.trade);
  if (sp.company) csvParams.set("company", sp.company);

  if (isPrint) {
    return (
      <div className="bg-white text-black p-6 print:p-0">
        <h1 className="text-xl font-semibold">
          Roster — {job ? `${job.number} ${job.name}` : "—"} — {date}
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Currently expected on site: {onSite}
          {sp.trade ? ` · trade: ${sp.trade}` : ""}
          {sp.company ? ` · company: ${sp.company}` : ""}
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-1 pr-3">Signed in</th>
              <th className="text-left py-1 pr-3">Name</th>
              <th className="text-left py-1 pr-3">Company</th>
              <th className="text-left py-1 pr-3">Trade</th>
              <th className="text-left py-1 pr-3">Mobile</th>
              <th className="text-left py-1 pr-3">Departure</th>
              <th className="text-left py-1 pr-3">White card</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-300">
                <td className="py-1 pr-3"><LocalTime iso={r.signedInAt.toISOString()} /></td>
                <td className="py-1 pr-3">{r.fullName}</td>
                <td className="py-1 pr-3">{r.companyName}</td>
                <td className="py-1 pr-3">{r.trade}</td>
                <td className="py-1 pr-3">{r.mobile}</td>
                <td className="py-1 pr-3"><LocalTime iso={r.plannedDepartureAt.toISOString()} /></td>
                <td className="py-1 pr-3">{r.whiteCardExpiry} ({whiteCardStatus(r.whiteCardExpiry)})</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-3 text-center text-slate-500">No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Daily roster</h1>
        <p className="text-slate-600 text-sm">
          Sign-ins per job and date. Filter, export, print, or share a read-only supervisor URL.
        </p>
      </div>

      <form className="bg-white border border-slate-200 rounded-lg p-4 grid sm:grid-cols-4 gap-3 text-sm">
        <label className="block">
          <span className="text-slate-700 mb-1 block">Job</span>
          <select name="job" defaultValue={job?.id ?? ""} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
            <option value="" disabled>Select…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.number} — {j.name}{j.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-700 mb-1 block">Date</span>
          <input type="date" name="date" defaultValue={date} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="text-slate-700 mb-1 block">Trade</span>
          <select name="trade" defaultValue={sp.trade ?? ""} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
            <option value="">All</option>
            {trades.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-700 mb-1 block">Company</span>
          <input
            type="text"
            name="company"
            defaultValue={sp.company ?? ""}
            placeholder="contains…"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <div className="sm:col-span-4 flex flex-wrap gap-2">
          <button type="submit" className="rounded-md bg-blue-700 text-white px-3 py-1.5">Apply</button>
          {job && (
            <>
              <a
                href={`/admin/roster/export.csv?${csvParams.toString()}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
              >
                Export CSV
              </a>
              <Link
                href={`/admin/roster?${csvParams.toString()}&print=1`}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
              >
                Print view
              </Link>
            </>
          )}
        </div>
      </form>

      {job ? (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Job</div>
              <div className="font-medium">{job.number}</div>
              <div className="text-sm text-slate-600">{job.name}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Sign-ins ({date})</div>
              <div className="text-2xl font-semibold">{rows.length}</div>
              <div className="text-xs text-slate-500">{allRows.length} before filters</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Currently expected on site</div>
              <div className="text-2xl font-semibold">{onSite}</div>
              <div className="text-xs text-slate-500">now ∈ [signed-in, planned departure]</div>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h2 className="text-base font-medium">Supervisor URL</h2>
            <p className="text-xs text-slate-600">
              Per-job public URL for a supervisor to view today&apos;s roster on their phone, no
              account required. Token-protected. Rotate to invalidate the old link.
            </p>
            <RotateTokenButton jobId={job.id} tokenAlreadySet={tokenSet} />
          </section>

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Signed in</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Trade</th>
                  <th className="px-3 py-2 font-medium">Mobile</th>
                  <th className="px-3 py-2 font-medium">Departure</th>
                  <th className="px-3 py-2 font-medium">White card</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">No sign-ins for that filter.</td></tr>
                ) : (
                  rows.map((r) => {
                    const status = whiteCardStatus(r.whiteCardExpiry);
                    const colour =
                      status === "valid"
                        ? "text-green-700"
                        : status === "expires_today"
                          ? "text-amber-700"
                          : "text-red-700";
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono"><LocalTime iso={r.signedInAt.toISOString()} /></td>
                        <td className="px-3 py-2">{r.fullName}</td>
                        <td className="px-3 py-2">{r.companyName}</td>
                        <td className="px-3 py-2">{r.trade}</td>
                        <td className="px-3 py-2 font-mono">{r.mobile}</td>
                        <td className="px-3 py-2 font-mono"><LocalTime iso={r.plannedDepartureAt.toISOString()} /></td>
                        <td className={`px-3 py-2 ${colour}`}>{r.whiteCardExpiry} ({status})</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-sm text-yellow-900">
          No job selected. Pick a job above, or <Link href="/admin/jobs/new" className="underline">create one</Link>.
        </div>
      )}
    </div>
  );
}
