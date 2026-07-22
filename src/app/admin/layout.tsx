import { BrandedHeader } from "@/components/branded-header";
import { can, requireUser, type Capability, type SessionUser } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Links without a capability are admin-only.
const NAV_GROUPS: {
  heading: string | null;
  links: { href: string; label: string; capability?: Capability }[];
}[] = [
  {
    heading: null,
    links: [{ href: "/dashboard", label: "Dashboard", capability: "reports.view" }],
  },
  {
    heading: "Quality Operations",
    links: [
      { href: "/admin/jobs", label: "Jobs", capability: "jobs.manage" },
      { href: "/admin/roster", label: "Roster", capability: "roster.manage" },
      { href: "/admin/incidents", label: "Incidents", capability: "incidents.review" },
      { href: "/admin/actions", label: "Actions", capability: "actions.manage" },
      { href: "/admin/meetings", label: "Meetings", capability: "meetings.manage" },
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

function visibleNavGroups(u: SessionUser) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) =>
      link.capability ? can(u, link.capability) : u.role === "admin",
    ),
  })).filter((group) => group.links.length > 0);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "site_staff") redirect("/dashboard");
  const navGroups = visibleNavGroups(user);
  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <BrandedHeader showSignOut />
      </div>
      <div className="flex-1 mx-auto max-w-6xl px-4 py-6 w-full grid md:grid-cols-[200px_1fr] gap-6 print:block print:max-w-none print:px-0 print:py-0">
        <nav className="text-sm print:hidden flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 md:block md:mx-0 md:px-0 md:pb-0 md:space-y-5 md:overflow-visible">
          {navGroups.map((group) => (
            <div key={group.heading ?? "overview"} className="contents md:block">
              {group.heading && (
                <p className="hidden md:block px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.heading}
                </p>
              )}
              <ul className="contents md:block md:space-y-1">
                {group.links.map((link) => (
                  <li key={link.href} className="shrink-0">
                    <Link
                      href={link.href}
                      className="block whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100 md:border-0 md:bg-transparent md:px-2 md:py-1"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
