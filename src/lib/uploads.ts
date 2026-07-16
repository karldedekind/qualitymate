import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED_IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

export function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? "/app/data/uploads";
}

/**
 * Upload scopes holding sensitive ContractFlow content. The public
 * /uploads route must refuse these; the admin-guarded
 * /contractflow/file route serves exactly this set.
 */
export const CONTRACTFLOW_PRIVATE_PREFIXES = [
  "contract-docs/",
  "contract-files/",
  "variation-files/",
  "communications/",
  "user-signatures/",
  "job-contract-files/",
] as const;

/** Save arbitrary bytes under uploads. Caller controls the relative path. */
export async function saveBytes(relPath: string, bytes: Buffer): Promise<string> {
  const fullPath = join(uploadsRoot(), relPath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, bytes);
  return relPath;
}

export async function saveFile(
  scope: string,
  file: File,
  opts: { allowedExt: Set<string>; maxBytes: number },
): Promise<{ path: string; originalFilename: string }> {
  const ext = extname(file.name).toLowerCase();
  if (!opts.allowedExt.has(ext)) {
    throw new Error(`Unsupported file type: ${ext || "(none)"}.`);
  }
  if (file.size > opts.maxBytes) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`,
    );
  }
  const relPath = `${scope}/${randomUUID()}${ext}`;
  await saveBytes(relPath, Buffer.from(await file.arrayBuffer()));
  return { path: relPath, originalFilename: file.name };
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
