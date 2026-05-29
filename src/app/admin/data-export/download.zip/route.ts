import { Readable } from "node:stream";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { buildExportStream } from "@/lib/data-export";
import { consume } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function GET() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const limit = consume(`data-export:${admin.id}`, {
    limit: 1,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!limit.ok) {
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "data-export.rate_limited",
      entity: { type: "data-export" },
      after: { retryAfterMs: limit.retryAfterMs },
      request: meta,
    });
    const retryAfter = Math.ceil(limit.retryAfterMs / 1000);
    return new Response(
      JSON.stringify({ error: "Too many exports", retryAfterSeconds: retryAfter }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(retryAfter),
        },
      },
    );
  }

  const { stream, manifest } = await buildExportStream();

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "data-export.run",
    entity: { type: "data-export" },
    after: manifest,
    request: meta,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  // Convert Node Readable to a Web ReadableStream for the Response body.
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="qualitymate-export-${stamp}.zip"`,
      "cache-control": "no-store",
    },
  });
}
