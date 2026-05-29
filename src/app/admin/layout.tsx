import { BrandedHeader } from "@/components/branded-header";
import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <BrandedHeader showSignOut />
      </div>
      <div className="flex-1 mx-auto max-w-6xl px-4 py-6 w-full grid md:grid-cols-[200px_1fr] gap-6 print:block print:max-w-none print:px-0 print:py-0">
        <nav className="text-sm print:hidden">
          <ul className="space-y-1">
            <li><Link href="/dashboard" className="block px-2 py-1 rounded hover:bg-slate-100">Dashboard</Link></li>
            <li><Link href="/admin/jobs" className="block px-2 py-1 rounded hover:bg-slate-100">Jobs</Link></li>
            <li><Link href="/admin/roster" className="block px-2 py-1 rounded hover:bg-slate-100">Roster</Link></li>
            <li><Link href="/admin/incidents" className="block px-2 py-1 rounded hover:bg-slate-100">Incidents</Link></li>
            <li><Link href="/admin/actions" className="block px-2 py-1 rounded hover:bg-slate-100">Actions</Link></li>
            <li><Link href="/admin/meetings" className="block px-2 py-1 rounded hover:bg-slate-100">Meetings</Link></li>
            <li><Link href="/admin/users" className="block px-2 py-1 rounded hover:bg-slate-100">Users</Link></li>
            <li><Link href="/admin/settings" className="block px-2 py-1 rounded hover:bg-slate-100">Settings</Link></li>
            <li><Link href="/admin/data-export" className="block px-2 py-1 rounded hover:bg-slate-100">Data export</Link></li>
            <li><Link href="/admin/backups" className="block px-2 py-1 rounded hover:bg-slate-100">Backups</Link></li>
            <li><Link href="/admin/audit-log" className="block px-2 py-1 rounded hover:bg-slate-100">Audit log</Link></li>
            <li><Link href="/admin/heartbeat" className="block px-2 py-1 rounded hover:bg-slate-100">Heartbeat</Link></li>
            <li><Link href="/admin/diagnostics" className="block px-2 py-1 rounded hover:bg-slate-100">Diagnostics</Link></li>
            <li><Link href="/admin/vendor/heartbeats" className="block px-2 py-1 rounded hover:bg-slate-100">Vendor monitoring</Link></li>
          </ul>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
