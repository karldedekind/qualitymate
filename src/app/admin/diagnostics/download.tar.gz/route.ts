import { Readable } from "node:stream";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { buildDiagnosticsBundle } from "@/lib/diagnostics";
import { getOrCreateInstanceId } from "@/lib/heartbeat";
import { getRequestMeta } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(JSON.stringify({ error: "DATABASE_URL missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const instanceId = await getOrCreateInstanceId().catch(() => null);
  const bundle = await buildDiagnosticsBundle({ databaseUrl, instanceId });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "diagnostics.export",
    entity: { type: "diagnostics" },
    after: bundle.manifest,
    request: meta,
  });

  bundle.stream.on("end", () => {
    void bundle.cleanup();
  });
  bundle.stream.on("error", () => {
    void bundle.cleanup();
  });

  const webStream = Readable.toWeb(bundle.stream) as unknown as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${bundle.filename}"`,
      "cache-control": "no-store",
    },
  });
}
