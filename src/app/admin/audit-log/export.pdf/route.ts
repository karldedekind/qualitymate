import { query, record } from "@/lib/audit";
import { toPdf } from "@/lib/audit-export";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setUTCHours(23, 59, 59, 999);
  return d;
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"), true);
  const entityType = url.searchParams.get("entity");

  const events = await query({ from, to, entityType, limit: 10_000 });
  const branding = await getBranding();
  const pdf = await toPdf(events, branding, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    entityType,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "audit.export.pdf",
    entity: { type: "audit_log" },
    after: { rows: events.length, from: url.searchParams.get("from"), to: url.searchParams.get("to"), entity: entityType },
    request: meta,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="audit-log-${stamp}.pdf"`,
    },
  });
}
