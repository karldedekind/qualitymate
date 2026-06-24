import { and, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  correctiveActions,
  incidents,
  jobs,
  meetings,
} from "@/db/schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type Kpis = {
  openIncidents: number;
  actionsOverdue: number;
  avgDaysToClose: number | null;
  nextQuarterlyMeetingStatus:
    | "scheduled"
    | "completed"
    | "cancelled"
    | "approved"
    | "none";
  nextQuarterlyMeetingAt: Date | null;
};

/** All four KPI numbers in one round-trip-friendly call. */
export async function kpis(now: Date = new Date()): Promise<Kpis> {
  const [openInc] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "incidents" WHERE "status" <> 'closed'`,
  );
  const [overdue] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "corrective_actions"
         WHERE "status" = 'open' AND "deadline" < ${now.toISOString()}`,
  );
  const [avg] = await db.execute<{ avg_days: number | null }>(
    sql`SELECT AVG(EXTRACT(EPOCH FROM ("closed_at" - "created_at")) / 86400.0)::float AS avg_days
         FROM "incidents"
         WHERE "status" = 'closed' AND "closed_at" IS NOT NULL`,
  );
  const upcoming = await db
    .select({ status: meetings.status, scheduledAt: meetings.scheduledAt })
    .from(meetings)
    .where(and(eq(meetings.status, "scheduled"), gte(meetings.scheduledAt, now)))
    .orderBy(meetings.scheduledAt)
    .limit(1);

  return {
    openIncidents: Number(openInc?.n ?? 0),
    actionsOverdue: Number(overdue?.n ?? 0),
    avgDaysToClose:
      avg?.avg_days == null ? null : Math.round(Number(avg.avg_days) * 10) / 10,
    nextQuarterlyMeetingStatus: upcoming[0]?.status ?? "none",
    nextQuarterlyMeetingAt: upcoming[0]?.scheduledAt ?? null,
  };
}

export type QuickOpsCounts = {
  jobs: number;
  roster: number;
  incidents: number;
  actions: number;
  meetings: number;
};

/** Live badge counts for the home-page Quality Operations tiles. */
export async function quickOpsCounts(now: Date = new Date()): Promise<QuickOpsCounts> {
  const [jobsRow] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "jobs" WHERE "active" = true`,
  );
  const [rosterRow] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "site_attendances"
         WHERE "signed_in_at"::date = ${now.toISOString()}::date`,
  );
  const [incRow] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "incidents" WHERE "status" <> 'closed'`,
  );
  const [actRow] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "corrective_actions" WHERE "status" = 'open'`,
  );
  const [mtgRow] = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "meetings"
         WHERE "status" = 'scheduled' AND "scheduled_at" >= ${now.toISOString()}`,
  );
  return {
    jobs: Number(jobsRow?.n ?? 0),
    roster: Number(rosterRow?.n ?? 0),
    incidents: Number(incRow?.n ?? 0),
    actions: Number(actRow?.n ?? 0),
    meetings: Number(mtgRow?.n ?? 0),
  };
}

export type TrendPoint = { month: string; count: number };

/** Monthly incident counts for the last `months` calendar months ending at `now`. */
export async function incidentTrend(
  months = 12,
  now: Date = new Date(),
): Promise<TrendPoint[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const rows = await db.execute<{ month: string; n: number }>(
    sql`SELECT to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month,
              COUNT(*)::int AS n
         FROM "incidents"
         WHERE "created_at" >= ${start.toISOString()}
         GROUP BY 1
         ORDER BY 1`,
  );
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.month, Number(r.n));
  const out: TrendPoint[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, count: byMonth.get(key) ?? 0 });
  }
  return out;
}

export type CategorySlice = { categoryId: string | null; label: string; count: number };

/** Incidents grouped by category over the last `windowDays` days. */
export async function categoryBreakdown(
  windowDays = 90,
  now: Date = new Date(),
): Promise<CategorySlice[]> {
  const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const rows = await db
    .select({
      categoryId: incidents.categoryId,
      label: categories.label,
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
    .from(incidents)
    .leftJoin(categories, eq(incidents.categoryId, categories.id))
    .where(gte(incidents.createdAt, since))
    .groupBy(incidents.categoryId, categories.label)
    .orderBy(desc(sql`COUNT(*)`));

  return rows.map((r) => ({
    categoryId: r.categoryId,
    label: r.label ?? "Uncategorised",
    count: Number(r.count),
  }));
}

export type ActionStatusBucket = { status: "open" | "resolved"; count: number };

/** Active actions split by status. */
export async function actionsByStatus(): Promise<ActionStatusBucket[]> {
  const rows = await db
    .select({
      status: correctiveActions.status,
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
    .from(correctiveActions)
    .groupBy(correctiveActions.status)
    .orderBy(correctiveActions.status);
  const out: ActionStatusBucket[] = [
    { status: "open", count: 0 },
    { status: "resolved", count: 0 },
  ];
  for (const r of rows) {
    const bucket = out.find((b) => b.status === r.status);
    if (bucket) bucket.count = Number(r.count);
  }
  return out;
}

export type TopJob = {
  jobId: string;
  number: string;
  name: string;
  count: number;
};

/** Jobs ranked by incident count over the last `windowDays` days. */
export async function topJobsByIncidentCount(
  limit = 5,
  windowDays = 90,
  now: Date = new Date(),
): Promise<TopJob[]> {
  const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const rows = await db
    .select({
      jobId: jobs.id,
      number: jobs.number,
      name: jobs.name,
      count: sql<number>`COUNT(${incidents.id})::int`.as("count"),
    })
    .from(incidents)
    .innerJoin(jobs, eq(incidents.jobId, jobs.id))
    .where(and(gte(incidents.createdAt, since), isNotNull(incidents.jobId)))
    .groupBy(jobs.id, jobs.number, jobs.name)
    .orderBy(desc(sql`COUNT(${incidents.id})`))
    .limit(limit);
  return rows.map((r) => ({
    jobId: r.jobId,
    number: r.number,
    name: r.name,
    count: Number(r.count),
  }));
}

// ---------- Site-staff helpers ----------

export type MyIncidentRow = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
};

/** Latest 5 incidents filed by the user. */
export async function myRecentIncidents(
  userId: string,
  limit = 5,
): Promise<MyIncidentRow[]> {
  return db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      createdAt: incidents.createdAt,
    })
    .from(incidents)
    .where(eq(incidents.filedBy, userId))
    .orderBy(desc(incidents.createdAt))
    .limit(limit);
}

export type MyActionRow = {
  id: string;
  title: string;
  status: "open" | "resolved";
  deadline: Date;
  overdue: boolean;
  incidentTitle: string | null;
};

/** Open actions assigned to user, with overdue flag. */
export async function myOpenActions(
  userId: string,
  now: Date = new Date(),
): Promise<MyActionRow[]> {
  const rows = await db
    .select({
      id: correctiveActions.id,
      title: correctiveActions.title,
      status: correctiveActions.status,
      deadline: correctiveActions.deadline,
      incidentTitle: incidents.title,
    })
    .from(correctiveActions)
    .leftJoin(incidents, eq(correctiveActions.incidentId, incidents.id))
    .where(
      and(
        eq(correctiveActions.assigneeId, userId),
        ne(correctiveActions.status, "resolved"),
      ),
    )
    .orderBy(correctiveActions.deadline);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    deadline: r.deadline,
    overdue: r.deadline.getTime() < now.getTime(),
    incidentTitle: r.incidentTitle,
  }));
}

// `lt` is re-exported only so unit tests can craft custom queries if needed.
export { lt };
