import { BrandedHeader } from "@/components/branded-header";
import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";

export const dynamic = "force-dynamic";

const NAV_GROUPS: { heading: string | null; links: { href: string; label: string }[] }[] = [
  {
    heading: null,
    links: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    heading: "Quality Operations",
    links: [
      { href: "/admin/jobs", label: "Jobs" },
      { href: "/admin/roster", label: "Roster" },
      { href: "/admin/incidents", label: "Incidents" },
      { href: "/admin/actions", label: "Actions" },
      { href: "/admin/meetings", label: "Meetings" },
    ],
  },
  {
    heading: "Administration",
    links: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
  {
    heading: "Records & Data",
    links: [
      { href: "/admin/audit-log", label: "Audit log" },
      { href: "/admin/data-export", label: "Data export" },
      { href: "/admin/backups", label: "Backups" },
    ],
  },
  {
    heading: "System Health",
    links: [
      { href: "/admin/heartbeat", label: "Heartbeat" },
      { href: "/admin/diagnostics", label: "Diagnostics" },
      { href: "/admin/vendor/heartbeats", label: "Vendor monitoring" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <BrandedHeader showSignOut />
      </div>
      <div className="flex-1 mx-auto max-w-6xl px-4 py-6 w-full grid md:grid-cols-[200px_1fr] gap-6 print:block print:max-w-none print:px-0 print:py-0">
        <nav className="text-sm print:hidden space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading ?? "overview"}>
              {group.heading && (
                <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.heading}
                </p>
              )}
              <ul className="space-y-1">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="block px-2 py-1 rounded hover:bg-slate-100">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
