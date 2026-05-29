import { join } from "node:path";
import {
  applyRetention,
  createTarball,
  defaultBackupsDir,
  defaultMigrationsDir,
  timestampForFilename,
} from "@/lib/backup";
import { isConfigured as s3Configured, pushObject } from "@/lib/s3";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[backup] DATABASE_URL is required");
    process.exit(1);
  }
  const backupsDir = defaultBackupsDir();
  const uploadsDir = process.env.UPLOADS_DIR ?? "/app/data/uploads";
  const migrationsDir = defaultMigrationsDir();
  const stamp = timestampForFilename();
  const outFile = join(backupsDir, `qualitymate-backup-${stamp}.tar.gz`);

  console.log(`[backup] writing ${outFile}`);
  const result = await createTarball({
    databaseUrl: process.env.DATABASE_URL,
    uploadsDir,
    migrationsDir,
    outFile,
  });
  console.log(`[backup] wrote ${result.bytes} bytes`);

  const retention = await applyRetention(backupsDir);
  console.log(`[backup] retention: kept=${retention.kept} pruned=${retention.pruned}`);

  if (await s3Configured()) {
    console.log("[backup] pushing offsite copy to S3");
    const push = await pushObject(outFile);
    if (push.ok) console.log(`[backup] s3 ok: ${push.key} (${push.bytes} bytes)`);
    else console.error(`[backup] s3 failed: ${push.error}`);
  }
}

main().catch((err) => {
  console.error("[backup] failed:", err);
  process.exit(1);
});
