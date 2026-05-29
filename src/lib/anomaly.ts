import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { jobs, siteAttendances, user } from "@/db/schema";
import { record } from "@/lib/audit";
import { send } from "@/lib/notify";
import { dayBoundsUtc } from "@/lib/roster";

export const ANOMALY_DEFAULTS = {
  lookbackDays: 30,
  threshold: 5,
};

function normaliseCompany(value: string): string {
  return value.trim().toLowerCase();
}

export type JobScanResult = {
  jobId: string;
  jobNumber: string;
  date: string;
  totalSignIns: number;
  knownCompanies: string[];
  unknownCompanies: string[];
  unknownCount: number;
  triggered: boolean;
};

export async function scanUnknownsForJob(
  jobId: string,
  dateIso: string,
  opts: { lookbackDays?: number; threshold?: number } = {},
): Promise<JobScanResult | null> {
  const lookbackDays = opts.lookbackDays ?? ANOMALY_DEFAULTS.lookbackDays;
  const threshold = opts.threshold ?? ANOMALY_DEFAULTS.threshold;

  const bounds = dayBoundsUtc(dateIso);
  if (!bounds) return null;

  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) return null;

  const dayRows = await db
    .select({ companyName: siteAttendances.companyName })
    .from(siteAttendances)
    .where(
      and(
        eq(siteAttendances.jobId, jobId),
        gte(siteAttendances.signedInAt, bounds.start),
        lt(siteAttendances.signedInAt, bounds.end),
      ),
    );

  const lookbackStart = new Date(bounds.start.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const priorRows = await db
    .select({ companyName: siteAttendances.companyName })
    .from(siteAttendances)
    .where(
      and(
        eq(siteAttendances.jobId, jobId),
        gte(siteAttendances.signedInAt, lookbackStart),
        lt(siteAttendances.signedInAt, bounds.start),
      ),
    );

  const knownSet = new Set(priorRows.map((r) => normaliseCompany(r.companyName)));
  const dayCompaniesSet = new Set<string>();
  const unknownSet = new Map<string, string>();

  for (const row of dayRows) {
    const norm = normaliseCompany(row.companyName);
    dayCompaniesSet.add(norm);
    if (!knownSet.has(norm) && !unknownSet.has(norm)) {
      unknownSet.set(norm, row.companyName.trim());
    }
  }

  const unknownCompanies = [...unknownSet.values()].sort();

  return {
    jobId,
    jobNumber: job.number,
    date: dateIso,
    totalSignIns: dayRows.length,
    knownCompanies: [...knownSet].sort(),
    unknownCompanies,
    unknownCount: unknownCompanies.length,
    triggered: unknownCompanies.length > threshold,
  };
}

export type ScanAllResult = {
  scanned: number;
  triggered: JobScanResult[];
  notifiedAdmins: number;
};

async function listActiveAdmins(): Promise<{ id: string; email: string }[]> {
  return db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.role, "admin"));
}

async function notifyAdminsOfAnomaly(result: JobScanResult): Promise<number> {
  const admins = await listActiveAdmins();
  const examples = result.unknownCompanies.slice(0, 5).join(", ");
  const body =
    `Job ${result.jobNumber}: ${result.unknownCount} unknown companies signed in on ${result.date}` +
    (examples ? ` — e.g. ${examples}` : "");

  let sent = 0;
  for (const admin of admins) {
    await send({
      userId: admin.id,
      type: "site_anomaly",
      entityType: "job",
      entityId: result.jobId,
      body,
      email: {
        subject: `Site sign-in anomaly — ${result.jobNumber}`,
        text: `${body}\n\nReview the daily roster in QualityMate.`,
      },
    });
    sent += 1;
  }
  return sent;
}

export async function scanAllJobs(
  dateIso: string,
  opts: { lookbackDays?: number; threshold?: number } = {},
): Promise<ScanAllResult> {
  const activeJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.active, true));
  const triggered: JobScanResult[] = [];
  let notifiedAdmins = 0;

  for (const j of activeJobs) {
    const result = await scanUnknownsForJob(j.id, dateIso, opts);
    if (!result) continue;

    await record({
      actor: null,
      action: "anomaly.scan",
      entity: { type: "job", id: result.jobId },
      after: {
        jobNumber: result.jobNumber,
        date: result.date,
        unknownCount: result.unknownCount,
        threshold: opts.threshold ?? ANOMALY_DEFAULTS.threshold,
      },
    });

    if (result.triggered) {
      triggered.push(result);
      const sent = await notifyAdminsOfAnomaly(result);
      notifiedAdmins += sent;
      await record({
        actor: null,
        action: "anomaly.detected",
        entity: { type: "job", id: result.jobId },
        after: {
          jobNumber: result.jobNumber,
          date: result.date,
          unknownCount: result.unknownCount,
          unknownCompanies: result.unknownCompanies,
          notifiedAdmins: sent,
        },
      });
    }
  }

  return { scanned: activeJobs.length, triggered, notifiedAdmins };
}
