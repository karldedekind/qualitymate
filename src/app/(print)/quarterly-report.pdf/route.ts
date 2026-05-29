import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getBranding } from "@/lib/branding";
import {
  actionsByStatus,
  categoryBreakdown,
  incidentTrend,
  kpis,
  topJobsByIncidentCount,
} from "@/lib/metrics";
import { renderQuarterlyReport } from "@/lib/quarterly-report-pdf";
import { getRequestMeta } from "@/lib/request-meta";
import { get, KNOWN_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const [branding, kpiData, trend, categories, actions, topJobs, repId] =
    await Promise.all([
      getBranding(),
      kpis(),
      incidentTrend(12),
      categoryBreakdown(90),
      actionsByStatus(),
      topJobsByIncidentCount(5, 90),
      get(KNOWN_KEYS.ISO_MANAGEMENT_REP),
    ]);

  let managementRepName: string | null = null;
  if (repId) {
    const rows = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, repId))
      .limit(1);
    managementRepName = rows[0]?.name ?? null;
  }

  const pdf = await renderQuarterlyReport(
    {
      kpis: kpiData,
      trend,
      categories,
      actions,
      topJobs,
      generatedAt: new Date(),
      managementRepName,
    },
    branding,
  );

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "report.quarterly.export",
    entity: { type: "report", id: "quarterly" },
    after: {
      openIncidents: kpiData.openIncidents,
      actionsOverdue: kpiData.actionsOverdue,
      bytes: pdf.length,
    },
    request: meta,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="quarterly-report-${stamp}.pdf"`,
    },
  });
}
