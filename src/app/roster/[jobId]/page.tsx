import { notFound } from "next/navigation";
import { getBranding } from "@/lib/branding";
import { findJobById } from "@/lib/jobs";
import {
  countCurrentlyOnSite,
  listForJob,
  todayIsoUtc,
  verifySupervisorToken,
  whiteCardStatus,
} from "@/lib/roster";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

type Params = Promise<{ jobId: string }>;
type Search = Promise<{ token?: string }>;

export default async function PublicRosterPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { jobId } = await params;
  const { token } = await searchParams;
  const job = await findJobById(jobId);
  if (!job) notFound();

  const valid = await verifySupervisorToken(jobId, token ?? "");
  const brand = await getBranding();

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Roster unavailable</h1>
          <p className="text-sm text-slate-600">
            The link is missing or invalid. Ask the site admin for a current supervisor URL.
          </p>
        </div>
      </div>
    );
  }

  const date = todayIsoUtc();
  const rows = await listForJob(jobId, date);
  const onSite = countCurrentlyOnSite(rows);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {brand.companyShortName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{brand.companyName}</div>
            <div className="text-xs text-slate-500">Supervisor roster · read only</div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{job.number} — {job.name}</h1>
          <p className="text-sm text-slate-600">Today, {date} (UTC)</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500">Sign-ins today</div>
            <div className="text-2xl font-semibold">{rows.length}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500">Currently expected on site</div>
            <div className="text-2xl font-semibold">{onSite}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">In</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Trade</th>
                <th className="px-3 py-2 font-medium">Departure</th>
                <th className="px-3 py-2 font-medium">White card</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">No sign-ins yet today.</td></tr>
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
                      <td className="px-3 py-2 font-mono"><LocalTime iso={r.plannedDepartureAt.toISOString()} /></td>
                      <td className={`px-3 py-2 ${colour}`}>{status}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
