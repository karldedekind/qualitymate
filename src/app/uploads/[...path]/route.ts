import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { uploadsRoot } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.join("/");
  const safe = normalize(joined);
  if (safe.startsWith("..") || safe.includes("/..") || safe.includes("\0")) {
    return new Response("not found", { status: 404 });
  }
  const full = join(uploadsRoot(), safe);
  try {
    const buf = await readFile(full);
    const ext = extname(safe).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": mime,
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
