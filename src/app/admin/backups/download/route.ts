import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { BACKUP_FILENAME_RE, defaultBackupsDir } from "@/lib/backup";
import { getRequestMeta } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  if (!BACKUP_FILENAME_RE.test(name)) {
    return new Response("Invalid backup filename", { status: 400 });
  }
  const full = join(defaultBackupsDir(), name);
  let s;
  try {
    s = await stat(full);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "backup.download",
    entity: { type: "backup", id: name },
    after: { bytes: s.size },
    request: meta,
  });
  const stream = createReadStream(full);
  const web = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  return new Response(web, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${name}"`,
      "content-length": String(s.size),
    },
  });
}
