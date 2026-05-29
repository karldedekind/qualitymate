import Link from "next/link";
import { BrandedHeader } from "@/components/branded-header";
import { requireUser } from "@/lib/auth-helpers";
import { listMine } from "@/lib/incidents";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ filed?: string }>;

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  open: "Open",
  closed: "Closed",
};

export default async function MyIncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { filed } = await searchParams;
  const rows = await listMine(user.id);

  return (
    <div className="min-h-screen flex flex-col">
      <BrandedHeader showSignOut />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My incidents</h1>
          <Link
            href="/incidents/new"
            className="rounded-md bg-blue-700 text-white px-3 py-2 text-sm font-medium"
          >
            New incident
          </Link>
        </div>
        {filed && (
          <div className="bg-green-50 border border-green-300 rounded p-3 text-sm text-green-900">
            Incident filed. Admin will review it.
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Filed</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No incidents yet.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
