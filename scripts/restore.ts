import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { defaultMigrationsDir, restoreTarball } from "@/lib/backup";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[restore] DATABASE_URL is required");
    process.exit(1);
  }
  const arg = process.argv[2];
  let tarFile: string;
  if (arg) {
    tarFile = arg;
  } else {
    const restoreDir = process.env.RESTORE_DIR ?? "/app/data/restore";
    const entries = (await readdir(restoreDir))
      .filter((f) => f.endsWith(".tar.gz"))
      .sort();
    const latest = entries[entries.length - 1];
    if (!latest) {
      console.error(`[restore] no tarball found in ${restoreDir} and no path supplied`);
      process.exit(1);
    }
    tarFile = join(restoreDir, latest);
  }

  console.log(`[restore] restoring from ${tarFile}`);
  const uploadsDir = process.env.UPLOADS_DIR ?? "/app/data/uploads";
  const migrationsDir = defaultMigrationsDir();

  const result = await restoreTarball({
    databaseUrl: process.env.DATABASE_URL,
    uploadsDir,
    migrationsDir,
    tarFile,
  });
  console.log(
    `[restore] manifest generatedAt=${result.manifest.generatedAt} ` +
      `tables=${result.manifest.tables.length} uploads=${result.uploadsRestored}`,
  );
  for (const [t, n] of Object.entries(result.rowsRestored)) {
    console.log(`  ${t}: ${n} rows`);
  }
  console.log("[restore] complete");
}

main().catch((err) => {
  console.error("[restore] failed:", err);
  process.exit(1);
});
