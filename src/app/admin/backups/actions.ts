"use server";

import { revalidatePath } from "next/cache";
import { join } from "node:path";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  createTarball,
  defaultBackupsDir,
  defaultMigrationsDir,
  timestampForFilename,
} from "@/lib/backup";
import { getRequestMeta } from "@/lib/request-meta";
import { isConfigured as s3Configured, pushObject, testPush } from "@/lib/s3";
import { set } from "@/lib/settings";

const S3FormSchema = z.object({
  endpoint: z.string().max(500).optional().nullable(),
  region: z.string().max(64).optional().nullable(),
  bucket: z.string().max(200).optional().nullable(),
  accessKeyId: z.string().max(200).optional().nullable(),
  secretAccessKey: z.string().max(500).optional().nullable(),
  forcePathStyle: z.string().optional().nullable(),
  prefix: z.string().max(200).optional().nullable(),
});

export async function saveS3SettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = S3FormSchema.safeParse({
    endpoint: formData.get("endpoint"),
    region: formData.get("region"),
    bucket: formData.get("bucket"),
    accessKeyId: formData.get("accessKeyId"),
    secretAccessKey: formData.get("secretAccessKey"),
    forcePathStyle: formData.get("forcePathStyle"),
    prefix: formData.get("prefix"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await set("s3.endpoint", parsed.data.endpoint?.trim() || null, { actor: { id: admin.id } });
  await set("s3.region", parsed.data.region?.trim() || null, { actor: { id: admin.id } });
  await set("s3.bucket", parsed.data.bucket?.trim() || null, { actor: { id: admin.id } });
  await set("s3.access_key_id", parsed.data.accessKeyId?.trim() || null, { actor: { id: admin.id } });
  // Only overwrite secret when a non-empty value was supplied (the form leaves it
  // blank to mean "keep existing").
  if (parsed.data.secretAccessKey && parsed.data.secretAccessKey.trim()) {
    await set("s3.secret_access_key", parsed.data.secretAccessKey.trim(), { actor: { id: admin.id } });
  }
  await set(
    "s3.force_path_style",
    parsed.data.forcePathStyle === "false" ? "false" : "true",
    { actor: { id: admin.id } },
  );
  await set("s3.prefix", parsed.data.prefix?.trim() || null, { actor: { id: admin.id } });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "s3.settings.update",
    entity: { type: "settings", id: "s3" },
    after: {
      bucket: parsed.data.bucket,
      endpoint: parsed.data.endpoint,
    },
    request: meta,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/backups");
  return { ok: true };
}

export async function testS3PushAction() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const r = await testPush();
  await record({
    actor: { id: admin.id, email: admin.email },
    action: r.ok ? "s3.test_push" : "s3.test_push_failure",
    entity: { type: "settings", id: "s3" },
    after: r.ok ? { key: r.key, etag: r.etag } : { error: r.error },
    request: meta,
  });
  return r.ok ? { ok: true, key: r.key } : { error: r.error };
}

export async function runBackupNowAction() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  if (!process.env.DATABASE_URL) return { error: "DATABASE_URL not set" };
  const stamp = timestampForFilename();
  const outFile = join(defaultBackupsDir(), `qualitymate-backup-${stamp}.tar.gz`);
  try {
    const result = await createTarball({
      databaseUrl: process.env.DATABASE_URL,
      uploadsDir: process.env.UPLOADS_DIR ?? "/app/data/uploads",
      migrationsDir: defaultMigrationsDir(),
      outFile,
    });
    let s3Key: string | null = null;
    if (await s3Configured()) {
      const push = await pushObject(outFile);
      if (push.ok) s3Key = push.key;
    }
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "backup.run",
      entity: { type: "backup", id: outFile },
      after: { bytes: result.bytes, s3Key },
      request: meta,
    });
    revalidatePath("/admin/backups");
    return { ok: true, file: outFile, bytes: result.bytes, s3Key };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "backup failed";
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "backup.run.failure",
      entity: { type: "backup" },
      after: { error: msg },
      request: meta,
    });
    return { error: msg };
  }
}
