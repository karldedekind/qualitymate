import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { findJobById } from "@/lib/jobs";
import { getRequestMeta } from "@/lib/request-meta";
import { filterRows, listForJob, todayIsoUtc, toCsv } from "@/lib/roster";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job");
  const date = url.searchParams.get("date") || todayIsoUtc();
  const trade = url.searchParams.get("trade");
  const company = url.searchParams.get("company");

  if (!jobId) return new Response("job is required", { status: 400 });
  const job = await findJobById(jobId);
  if (!job) return new Response("job not found", { status: 404 });

  const all = await listForJob(jobId, date);
  const rows = filterRows(all, { trade, company });
  const csv = toCsv(rows);

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "roster.export.csv",
    entity: { type: "job", id: jobId },
    after: { jobNumber: job.number, date, rows: rows.length, trade, company },
    request: meta,
  });

  const slug = job.number.replace(/[^\x20-\x7E]/g, "-").replace(/["\\]/g, "").trim() || "job";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="roster-${slug}-${date}.csv"; filename*=UTF-8''${encodeURIComponent(`roster-${job.number}-${date}.csv`)}`,
    },
  });
}
