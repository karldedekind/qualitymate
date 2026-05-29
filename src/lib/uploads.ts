import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED_IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

export function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? "/app/data/uploads";
}

export async function saveImage(scope: string, file: File): Promise<string> {
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_IMAGE_EXT.has(ext)) {
    throw new Error(`Unsupported image type: ${ext || "(none)"}. Use PNG, JPG, SVG, or WebP.`);
  }
  const max = 5 * 1024 * 1024;
  if (file.size > max) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 5 MB.`);
  }
  const dir = join(uploadsRoot(), scope);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const fullPath = join(dir, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buf);
  return `${scope}/${filename}`;
}
