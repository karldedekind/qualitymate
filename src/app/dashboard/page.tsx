import Link from "next/link";
import { BrandedHeader } from "@/components/branded-header";
import {
  ActionsByStatusStacked,
  CategoryDonut,
  IncidentTrendLine,
  TopJobsBar,
} from "@/components/dashboard-charts";
import { requireUser } from "@/lib/auth-helpers";
import {
  actionsByStatus,
  categoryBreakdown,
  incidentTrend,
  kpis,
  myOpenActions,
  myRecentIncidents,
  quickOpsCounts,
  topJobsByIncidentCount,
  type Kpis,
  type MyActionRow,
  type MyIncidentRow,
  type QuickOpsCounts,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex flex-col">
      <BrandedHeader showSignOut />
      <main className="flex-1 mx-auto max-w-6xl px-4 py-8 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Hello, {user.name}</h1>
          <p className="text-slate-600 text-sm">
            Signed in as <span className="font-mono">{user.email}</span> ({user.role}).
          </p>
        </div>

        {user.role === "admin" ? (
          <AdminDashboard />
        ) : (
          <SiteStaffDashboard userId={user.id} />
        )}
      </main>
    </div>
  );
}

async function SiteStaffDashboard({ userId }: { userId: string }) {
  const [recent, actions] = await Promise.all([
    myRecentIncidents(userId, 5),
    myOpenActions(userId),
  ]);
  return (
    <div className="space-y-6">
      <Link
        href="/incidents/new"
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-lg font-semibold px-6 py-5 shadow transition-colors"
      >
        <span className="text-2xl leading-none">+</span>
        File an Incident
      </Link>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <header className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium">My recent incidents</h2>
            <Link href="/incidents/mine" className="text-sm text-blue-700 hover:underline">
              View all →
            </Link>
          </header>
          <RecentIncidentsList items={recent} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <header className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium">My corrective actions</h2>
            <Link href="/actions/mine" className="text-sm text-blue-700 hover:underline">
              View all →
            </Link>
          </header>
          <MyActionsList items={actions} />
        </section>
      </div>
    </div>
  );
}

function RecentIncidentsList({ items }: { items: MyIncidentRow[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No incidents filed yet.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((i) => (
        <li key={i.id} className="py-2 flex items-center justify-between gap-3">
          <span className="truncate">{i.title}</span>
          <span className="text-xs font-mono text-slate-500 shrink-0">
            {i.status} · {i.createdAt.toISOString().slice(0, 10)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MyActionsList({ items }: { items: MyActionRow[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No open actions assigned.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => (
        <li
          key={a.id}
          className={
            a.overdue
              ? "py-2 flex items-center justify-between gap-3 bg-red-50 -mx-2 px-2 rounded"
              : "py-2 flex items-center justify-between gap-3"
          }
        >
          <span className="truncate">
            {a.title}
            {a.incidentTitle && (
              <span className="text-xs text-slate-500"> · {a.incidentTitle}</span>
            )}
          </span>
          <span
            className={
              a.overdue
                ? "text-xs font-mono text-red-700 font-medium shrink-0"
                : "text-xs font-mono text-slate-500 shrink-0"
            }
          >
            {a.overdue ? "OVERDUE " : ""}
            {a.deadline.toISOString().slice(0, 10)}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function AdminDashboard() {
  const [kpiData, trend, categories, actions, topJobs, opsCounts] = await Promise.all([
    kpis(),
    incidentTrend(12),
    categoryBreakdown(90),
    actionsByStatus(),
    topJobsByIncidentCount(5, 90),
    quickOpsCounts(),
  ]);

  return (
    <div className="space-y-6">
      <QuickOps counts={opsCounts} />

      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-2">
        Reports
      </h2>

      <KpiGrid kpis={kpiData} />

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Incidents — last 12 months">
          <IncidentTrendLine data={trend} />
        </ChartCard>
        <ChartCard title="Categories — last 90 days">
          <CategoryDonut data={categories} />
        </ChartCard>
        <ChartCard title="Top 5 jobs by incidents — last 90 days">
          <TopJobsBar data={topJobs} />
        </ChartCard>
        <ChartCard title="Corrective actions by status">
          <ActionsByStatusStacked data={actions} />
        </ChartCard>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/quarterly-report.pdf"
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium"
        >
          Download quarterly report (PDF)
        </Link>
      </div>
    </div>
  );
}

const QUICK_OPS: { href: string; label: string; key: keyof QuickOpsCounts }[] = [
  { href: "/admin/jobs", label: "Jobs", key: "jobs" },
  { href: "/admin/roster", label: "Roster", key: "roster" },
  { href: "/admin/incidents", label: "Incidents", key: "incidents" },
  { href: "/admin/actions", label: "Actions", key: "actions" },
  { href: "/admin/meetings", label: "Meetings", key: "meetings" },
];

function QuickOps({ counts }: { counts: QuickOpsCounts }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Quality Operations
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {QUICK_OPS.map((op) => (
          <Link
            key={op.href}
            href={op.href}
            className="group relative flex flex-col items-center justify-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 shadow-sm ring-1 ring-transparent hover:bg-blue-100 hover:border-blue-400 hover:ring-blue-300 transition-colors"
          >
            <span className="absolute top-2 right-2 text-blue-400 group-hover:text-blue-600 transition-colors">
              →
            </span>
            <span className="text-2xl font-semibold leading-none text-blue-800">
              {counts[op.key]}
            </span>
            <span className="text-sm font-medium text-blue-700">{op.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpis }) {
  const cards = [
    { label: "Open incidents", value: kpis.openIncidents.toString() },
    { label: "Actions overdue", value: kpis.actionsOverdue.toString() },
    {
      label: "Avg days to close",
      value:
        kpis.avgDaysToClose == null ? "—" : kpis.avgDaysToClose.toFixed(1),
    },
    {
      label: "Next quarterly meeting",
      value:
        kpis.nextQuarterlyMeetingAt == null
          ? "None scheduled"
          : kpis.nextQuarterlyMeetingAt.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {c.label}
          </div>
          <div className="text-2xl font-semibold mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      {children}
    </section>
  );
}
