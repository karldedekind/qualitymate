import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { generatePoster } from "@/lib/qr-poster";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const { id } = await ctx.params;

  const result = await generatePoster(id);
  if (!result) return new Response("job not found", { status: 404 });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "poster.generate",
    entity: { type: "job", id },
    after: { jobNumber: result.job.number, url: result.url },
    request: meta,
  });

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
    },
  });
}
