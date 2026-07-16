import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { requireAdmin } from "@/lib/auth-helpers";
import { CONTRACTFLOW_PRIVATE_PREFIXES, uploadsRoot } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  await requireAdmin();
  const { path } = await params;
  const joined = path.join("/");
  const safe = normalize(joined);
  if (safe.startsWith("..") || safe.includes("/..") || safe.includes("\0")) {
    return new Response("not found", { status: 404 });
  }
  if (!CONTRACTFLOW_PRIVATE_PREFIXES.some((p) => safe.startsWith(p))) {
    return new Response("not found", { status: 404 });
  }
  try {
    const buf = await readFile(join(uploadsRoot(), safe));
    const ext = extname(safe).toLowerCase();
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "content-disposition": `inline; filename="${safe.split("/").pop()}"`,
        "cache-control": "private, max-age=0",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
